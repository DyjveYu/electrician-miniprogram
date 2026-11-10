function uploadPhoto(side, filePath, session, draftId) {
  return new Promise((resolve, reject) => {
    wx.uploadFile({
      url: `${session.baseUrl}/electricians/certification/id-card/ocr/${side}`,
      header: { Authorization: `Bearer ${session.token}` },
      name: 'image',
      filePath,
      formData: draftId ? { draftId } : {},
      timeout: 50000,
      success(response) {
        try {
          const body = JSON.parse(response.data);
          if (body.success && body.data) return resolve(body.data);
          reject(new Error(body.message || '身份证识别失败，请重试'));
        } catch {
          reject(new Error('身份证识别失败，请重试'));
        }
      },
      fail: error => reject(new Error(/timeout/i.test(error?.errMsg || '')
        ? '身份证上传请求超时，请稍后重试'
        : '上传失败，请检查网络后重试'))
    });
  });
}

Page({
  data: {
    displayFront: '',
    displayBack: '',
    idCardFront: '',
    idCardBack: '',
    uploading: false,
    readOnly: false
  },

  onLoad() {
    const { baseUrl, token, userInfo } = getApp().globalData;
    this.session = { baseUrl, token, userId: userInfo?.id };
    this.getOpenerEventChannel().on('acceptDataFromOpenerPage', data => {
      this.setData({ readOnly: data.readOnly });
      this.showPhoto('displayFront', data.idCardFront);
      this.showPhoto('displayBack', data.idCardBack);
    });
  },

  onUnload() {
    this.closed = true;
  },

  isCurrent() {
    const { token, userInfo } = getApp().globalData;
    return !this.closed && this.session.token === token && this.session.userId === userInfo?.id;
  },

  showPhoto(field, path) {
    if (!path || !this.isCurrent()) return;
    const { baseUrl, token } = this.session;
    const origin = baseUrl.replace(/\/api\/?$/, '');
    if (!/^\/api\/electricians\/certification\/id-card\/(front|back)$/.test(path)) {
      this.setData({ [field]: path.startsWith('/uploads/') ? origin + path : path });
      return;
    }
    wx.downloadFile({
      url: origin + path,
      header: { Authorization: `Bearer ${token}` },
      success: res => {
        if (res.statusCode === 200 && this.isCurrent() && !this.data[field]) {
          this.setData({ [field]: res.tempFilePath });
        }
      }
    });
  },

  chooseImage(event) {
    const front = event.currentTarget.dataset.type === 'front';
    const display = front ? 'displayFront' : 'displayBack';
    const file = front ? 'idCardFront' : 'idCardBack';
    if (!this.isCurrent() || this.data.uploading) return;
    if (this.data.readOnly) {
      if (this.data[display]) wx.previewImage({ urls: [this.data[display]] });
      return;
    }
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: res => {
        if (!this.isCurrent() || this.data.uploading) return;
        if (res.tempFiles?.[0]?.size >= 2 * 1024 * 1024) {
          wx.showToast({ title: '请选择小于 2 MB 的照片', icon: 'none' });
          return;
        }
        const path = res.tempFilePaths[0];
        this.setData({ [file]: path, [display]: path });
      }
    });
  },

  async submit() {
    const { idCardFront, idCardBack, uploading, readOnly } = this.data;
    if (uploading || readOnly || !idCardFront || !idCardBack || !this.isCurrent()) return;
    this.setData({ uploading: true });
    try {
      const front = await uploadPhoto('front', idCardFront, this.session);
      if (!this.isCurrent()) return;
      const back = await uploadPhoto('back', idCardBack, this.session, front.draftId);
      if (!this.isCurrent()) return;
      this.getOpenerEventChannel().emit('acceptDataFromIdentityPage', {
        idCardFront, idCardBack, ...front, ...back
      });
      wx.navigateBack();
    } catch (error) {
      if (this.isCurrent()) wx.showModal({ title: '身份证识别失败', content: error.message, showCancel: false });
    } finally {
      if (this.isCurrent()) this.setData({ uploading: false });
    }
  }
});
