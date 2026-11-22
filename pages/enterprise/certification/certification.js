const enterpriseSession = require('../../../utils/enterpriseSession');
const orderEntry = require('../../../utils/orderEntry');
// pages/enterprise/certification/certification.js
const app = getApp();

// 实时日志封装（无需额外依赖文件，直接内联）
const rtLog = wx.getRealtimeLogManager ? wx.getRealtimeLogManager() : null;
const log = {
  info(...args) { rtLog && rtLog.info.apply(rtLog, args); },
  warn(...args) { rtLog && rtLog.warn.apply(rtLog, args); },
  error(...args) { rtLog && rtLog.error.apply(rtLog, args); }
};

require('../../../utils/visitCapture').register(Page, {
  data: {
    mode: 'apply', // apply: 申请认证, view: 查看认证
    formData: {
      companyName: '',
      creditCode: '',
      addressDetail: '',
      contactName: '',
      contactPhone: ''
    },
    certStatus: '', // pending: 认证中, approved: 已认证, returned: 已打回
    returnReason: '',
    submitDisabled: true,
    region: ['', '', ''],
    customItem: '全部',
    licenseImagePath: '',
    licenseImageUrl: '',
    restrictedCertification: false,
    certificationReady: false,
    continuingOrder: false,
    continuationMessage: '',
    checkingContinuation: false,
    submitting: false
  },

  onLoad(options = {}) {
    this._restricted = app._enterpriseCertificationSession || null;
    this._account = orderEntry.key(app);
    this._entryId = this._restricted ? null : options.orderEntry;
    this._visible = false;
    this._unloaded = false;
    this._queryGeneration = 0;
    this._pollAttempt = 0;
    this.setData({
      restrictedCertification: !!this._restricted,
      continuingOrder: !!this._entryId && orderEntry.valid(app, this._entryId)
    });
    if (!this._restricted && options.mode) {
      this.setData({ mode: options.mode });
    }

    // 手机号自动从登录信息带出，不可修改
    const phone = this._restricted?.user.phone || app.globalData.userInfo?.phone;
    if (phone) this.setData({ 'formData.contactPhone': phone });

    // 提前获取网络类型，供后续上传失败时一并上报
    wx.getNetworkType({
      success: (res) => {
        this._networkType = res.networkType;
      }
    });

  },

  onShow() {
    if (!this._current()) {
      wx.reLaunch({ url: app.globalData.isLogin ? '/pages/index/index' : '/pages/login/login' });
      return;
    }
    this._visible = true;
    if (this._restricted) {
      if (wx.hideHomeButton) wx.hideHomeButton();
      if (this._restricted.expiresAt <= Date.now()) {
        this.cancelCertification();
        wx.showToast({ title: '认证会话已过期，请重新登录', icon: 'none' });
        return;
      }
      if (this._pendingApproval) {
        if (!this.finishRestrictedCertification(this._pendingApproval) && this._current()) {
          this.setData({ continuationMessage: '认证结果尚未确认，请重试提交' });
        }
        return;
      }
      if (this.data.certificationReady || this.data.submitting) return;
    }
    this._pollAttempt = 0;
    this.loadCertificationInfo();
  },

  onHide() {
    if (this.data.checkingContinuation || (this._restricted && this.data.submitting)) wx.hideLoading();
    this._visible = false;
    this._queryGeneration++;
    clearTimeout(this._pollTimer);
  },

  onUnload() {
    this.onHide();
    this._unloaded = true;
    if (this._restricted) {
      this.cancelCertification();
      return;
    }
    if (orderEntry.valid(app, this._entryId) && this._entryId) orderEntry.clear();
  },

  _current() {
    if (this._unloaded) return false;
    if (this._restricted) return app._enterpriseCertificationSession === this._restricted;
    return !!this._account && this._account === orderEntry.key(app) &&
      app.globalData.userInfo?.current_role === 'enterprise';
  },

  certificationAuthorization() {
    return `Bearer ${this._restricted?.token || app.globalData.token}`;
  },

  cancelCertification() {
    if (!this._restricted || app._enterpriseCertificationSession !== this._restricted) return;
    this._pendingApproval = null;
    this._uploadedLicense = null;
    this._queryGeneration++;
    clearTimeout(this._pollTimer);
    if (this.data.checkingContinuation || this.data.submitting) wx.hideLoading();
    app.logout({ forceLogin: true });
    for (const task of [this._queryTask, this._uploadTask, this._submitTask]) task?.abort?.();
  },

  goBack() {
    if (this._restricted) return this.cancelCertification();
    wx.navigateBack();
  },

  retryContinuation() {
    if (this._restricted || !this._current() || !this._visible || this.data.checkingContinuation) return;
    this._pollAttempt = 0;
    this.loadCertificationInfo();
  },

  cancelContinuation() {
    if (this._entryId && orderEntry.valid(app, this._entryId)) orderEntry.clear();
    this._entryId = null;
    this._queryGeneration++;
    clearTimeout(this._pollTimer);
    this.setData({ continuingOrder: false, checkingContinuation: false, continuationMessage: '' });
  },

  // 加载企业认证信息
  loadCertificationInfo() {
    if (!this._current() || !this._visible) return;
    clearTimeout(this._pollTimer);
    const generation = ++this._queryGeneration;
    const current = () => this._current() && this._visible && generation === this._queryGeneration;
    this.setData({ checkingContinuation: true });
    wx.showLoading({ title: '加载中' });

    const queryFailed = () => this.setData({
      continuationMessage: this._restricted ? '暂时无法读取企业资料，请取消后重新登录' : '查询失败，请重新查询'
    });
    this._queryTask = enterpriseSession.request({
      url: `${app.globalData.baseUrl}/miniprogram/enterprise/certification`,
      method: 'GET',
      header: {
        'Authorization': this.certificationAuthorization()
      },
      success: (res) => {
        if (!current()) return;
        if (enterpriseSession.successfulResponse(res)) {
          const data = res.data.data;
          if (this._restricted && data !== null && data?.certStatus !== 'pending') {
            const message = data?.certStatus === 'approved' ?
              '企业认证已完成，请取消后重新登录' : '暂时无法确认企业认证状态，请取消后重新登录';
            this.setData({ continuationMessage: message });
            return;
          }
          if (this.data.continuingOrder && orderEntry.valid(app, this._entryId)) {
            if (data?.certStatus === 'approved' && orderEntry.consume(app, this._entryId)) {
              app.globalData.enterpriseCertification = data;
              this._entryId = null;
              wx.reLaunch({ url: '/pages/order/create/create' });
              return;
            }
            this.setData({ continuationMessage: '资料尚未通过，请提交资料或重新查询' });
          }
          // 如果有认证记录，填充表单并切换到查看模式
          if (data && data.certStatus) {
            this.setData({
              mode: this._restricted ? 'apply' : 'view',
              certificationReady: !!this._restricted,
              ...(this._restricted && { continuationMessage: '' }),
              certStatus: data.certStatus,
              returnReason: data.returnReason || '',
              formData: {
                companyName: data.companyName || '',
                creditCode: data.creditCode || '',
                addressDetail: data.address || '',
                contactName: data.contactName || '',
                contactPhone: this._restricted?.user.phone || data.contactPhone || this.data.formData.contactPhone
              },
              region: [
                data.province || '',
                data.city || '',
                data.district || ''
              ],
              licenseImagePath: data.licenseImage || '',
              licenseImageUrl: this.resolveLicenseImageUrl(data.licenseImage)
            }, () => {
              this.checkFormValid();
            });
          } else {
            // 无认证记录，保持申请模式
            this.setData({
              mode: 'apply', certStatus: '', returnReason: '',
              ...(this._restricted && { certificationReady: true, continuationMessage: '' })
            });
          }
        } else {
          queryFailed();
          log.warn('load_certification_biz_fail', {
            code: res?.data?.code,
            message: res?.data?.message
          });
        }
      },
      fail: (err) => {
        if (!current()) return;
        queryFailed();
        log.error('load_certification_fail', { errMsg: err.errMsg });
        wx.showToast({ title: '加载失败', icon: 'none' });
      },
      complete: () => {
        if (current()) { this.setData({ checkingContinuation: false }); wx.hideLoading(); }
      }
    });
  },

  // 表单输入处理
  onInputChange(e) {
    if (this._restricted && (!this._current() || this.data.submitting)) return;
    const { field } = e.currentTarget.dataset;
    const { value } = e.detail;

    this.setData({
      [`formData.${field}`]: value
    });

    this.checkFormValid();
  },

  // 省市区选择器变更
  bindRegionChange(e) {
    if (this._restricted && (!this._current() || this.data.submitting)) return;
    this.setData({
      region: e.detail.value
    });

    this.checkFormValid();
  },

  // 选择营业执照图片
  chooseLicenseImage() {
    if (this._restricted && (!this._current() || !this.data.certificationReady || this.data.submitting)) return;
    if (this.data.mode === 'view' && !['approved', 'returned'].includes(this.data.certStatus)) {
      wx.showToast({ title: '认证中不可修改', icon: 'none' });
      return;
    }

    const that = this;
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success(res) {
        if (!that._current()) return;
        const tempFilePath = res.tempFilePaths[0];
        that._uploadedLicense = null;
        that.setData({
          licenseImagePath: tempFilePath,
          licenseImageUrl: that.resolveLicenseImageUrl(tempFilePath)
        });
        that.checkFormValid();
      },
      fail(err) {
        if (!that._current()) return;
        // 用户主动取消不算异常，不需要打扰用户/上报
        if (err.errMsg && err.errMsg.indexOf('cancel') !== -1) {
          return;
        }
        log.warn('choose_license_image_fail', { errMsg: err.errMsg });
        wx.showToast({ title: '获取图片失败，请检查相册/相机权限', icon: 'none' });
      }
    });
  },

  // 预览营业执照图片
  resolveLicenseImageUrl(path) {
    if (!path) return '';
    return path.startsWith('/uploads/')
      ? `${app.globalData.imageBaseUrl.replace(/\/$/, '')}${path}`
      : path;
  },

  previewLicenseImage() {
    if (this._restricted && (!this._current() || this.data.submitting)) return;
    const url = this.resolveLicenseImageUrl(this.data.licenseImagePath);
    if (!url) return;

    wx.previewImage({
      urls: [url]
    });
  },

  // 检查表单是否有效
  checkFormValid() {
    const { formData } = this.data;

    const isValid =
      formData.companyName &&
      formData.companyName.trim().length > 0 &&
      formData.creditCode &&
      formData.creditCode.trim().length === 18 &&
      this.data.region[0] &&
      this.data.region[1] &&
      this.data.region[2] &&
      formData.addressDetail &&
      formData.addressDetail.trim().length > 0 &&
      formData.contactName &&
      formData.contactName.trim().length > 0 &&
      this.data.licenseImagePath;

    this.setData({
      submitDisabled: !isValid
    });
  },

  // 上传营业执照图片（返回相对路径）
  uploadLicenseImage(filePath) {
    return new Promise((resolve, reject) => {
      if (!filePath || typeof filePath !== 'string') {
        reject(new Error('图片路径无效'));
        return;
      }

      // 如果已经是相对路径，直接返回
      if (filePath.startsWith('/uploads/')) {
        resolve(filePath);
        return;
      }
      if (this._restricted && this._uploadedLicense?.source === filePath) {
        resolve(this._uploadedLicense.path);
        return;
      }

      // 先获取文件大小，便于失败时一并上报诊断信息
      wx.getFileSystemManager().getFileInfo({
        filePath,
        success: (fileInfo) => this._doUploadLicenseImage(filePath, fileInfo.size, resolve, reject),
        fail: () => this._doUploadLicenseImage(filePath, -1, resolve, reject)
      });
    });
  },

  _doUploadLicenseImage(filePath, fileSize, resolve, reject) {
    if (!this._current()) {
      reject(new Error('登录状态已变化，请重新进入'));
      return;
    }
    const systemInfo = wx.getSystemInfoSync ? wx.getSystemInfoSync() : {};

    this._uploadTask = enterpriseSession.uploadFile({
      url: `${app.globalData.baseUrl}/upload/certification`,
      filePath: filePath,
      name: 'certification',
      timeout: 30000, // 显式设置超时，避免默认值在弱网下过短
      header: {
        'Authorization': this.certificationAuthorization()
      },
      success: (res) => {
        // 无论状态码是多少，都先尝试解析响应体——
        // 后端 res.error() 在 400/401/403/413 等情况下同样会返回带 message 的 JSON，
        // 之前的写法一看到非 200 就直接吞掉了这些真实原因。
        let parsedData = null;
        try {
          parsedData = JSON.parse(res.data);
        } catch (e) {
          // 非 JSON 响应（比如 Nginx/网关直接返回的错误页），走下面兜底
        }

        if (res.statusCode !== 200) {
          const backendMessage = parsedData && parsedData.message;
          log.error('cert_upload_http_error', {
            statusCode: res.statusCode,
            backendMessage,
            fileSize,
            platform: systemInfo.platform,
            SDKVersion: systemInfo.SDKVersion,
            rawData: this._restricted || parsedData ? undefined : (res.data || '').toString().slice(0, 200)
          });
          reject(new Error(backendMessage || `营业执照上传失败(HTTP ${res.statusCode})`));
          return;
        }

        try {
          const data = parsedData || JSON.parse(res.data);
          if (data.success !== false && data.code === 200 && data.data && data.data.url) {
            let url = data.data.url;
            let relativePath;

            if (url.startsWith('http://') || url.startsWith('https://')) {
              const match = url.match(/\/uploads\/.+$/);
              if (match) {
                relativePath = match[0];
              } else {
                const urlParts = url.split('/');
                const uploadsIndex = urlParts.indexOf('uploads');
                if (uploadsIndex > 0) {
                  relativePath = '/' + urlParts.slice(uploadsIndex).join('/');
                } else {
                  relativePath = url;
                }
              }
            } else if (url.startsWith('/')) {
              relativePath = url;
            } else {
              relativePath = '/' + url;
            }

            if (this._restricted) {
              const token = data.data.certificationUploadToken;
              if (typeof token !== 'string' || !token) {
                reject(new Error('营业执照上传结果无效，请重试'));
                return;
              }
              this._uploadedLicense = { source: filePath, path: relativePath, token };
            }
            resolve(relativePath);
          } else {
            log.error('cert_upload_biz_error', {
              code: data.code,
              message: data.message,
              fileSize
            });
            reject(new Error(data.message || '营业执照上传失败'));
          }
        } catch (e) {
          log.error('cert_upload_parse_error', {
            fileSize,
            rawData: this._restricted ? undefined : (res.data || '').toString().slice(0, 200)
          });
          reject(new Error('解析响应失败'));
        }
      },
      fail: (err) => {
        log.error('cert_upload_fail', {
          errMsg: err.errMsg,
          fileSize,
          networkType: this._networkType,
          platform: systemInfo.platform,
          SDKVersion: systemInfo.SDKVersion
        });
        reject(new Error(err.errMsg || '网络错误'));
      }
    });
  },

  // 提交认证申请
  async submitCertification() {
    if (!this._current() || this.data.submitDisabled || this.data.submitting ||
        (this._restricted && !this.data.certificationReady)) {
      wx.showToast({ title: '请完善信息后再提交', icon: 'none' });
      return;
    }

    // 校验省市区完整性
    const region = this.data.region;
    if (!region[0] || !region[1] || !region[2]) {
      wx.showToast({ title: '请选择完整的省市区', icon: 'none' });
      return;
    }
    if (region[1] === '全部' || region[2] === '全部') {
      wx.showToast({ title: '请选择城市和区县', icon: 'none' });
      return;
    }

    // 校验信用代码长度
    if (this.data.formData.creditCode.trim().length !== 18) {
      wx.showToast({ title: '统一社会信用代码必须为18位', icon: 'none' });
      return;
    }

    // 提交开始后，旧的查询响应不能覆盖本次保存结果。
    this._queryGeneration++;
    clearTimeout(this._pollTimer);
    this.setData({ checkingContinuation: false });
    this.setData({ submitting: true });
    wx.showLoading({ title: '上传营业执照...', mask: !this._restricted });

    try {
      // 上传营业执照图片
      const imageSource = this.data.licenseImagePath;
      let licenseImagePath;
      if (typeof imageSource === 'string' && imageSource.trim()) {
        licenseImagePath = await this.uploadLicenseImage(imageSource);
      } else {
        throw new Error('请上传营业执照副本');
      }

      if (!this._current() || (!this._restricted && !this._visible)) return;
      if (this._visible) wx.showLoading({ title: '提交认证...', mask: !this._restricted });

      const requestData = {
        companyName: this.data.formData.companyName.trim(),
        creditCode: this.data.formData.creditCode.trim(),
        province: this.data.region[0],
        city: this.data.region[1],
        district: this.data.region[2],
        address: this.data.formData.addressDetail.trim(),
        contactName: this.data.formData.contactName.trim(),
        licenseImage: licenseImagePath
      };
      if (this._restricted && this._uploadedLicense?.source === imageSource &&
          this._uploadedLicense.path === licenseImagePath) {
        requestData.certificationUploadToken = this._uploadedLicense.token;
      }

      const submission = await new Promise((resolve, reject) => {
        this._submitTask = enterpriseSession.request({
          url: `${app.globalData.baseUrl}/miniprogram/enterprise/certification`,
          method: 'POST',
          header: {
            'Authorization': this.certificationAuthorization(),
            'Content-Type': 'application/json'
          },
          data: requestData,
          success: (res) => {
            if (enterpriseSession.successfulResponse(res)) {
              resolve(res.data);
            } else {
              log.error('cert_submit_biz_error', {
                code: res?.data?.code,
                message: res?.data?.message
              });
              reject(new Error(res.data?.message || '提交失败'));
            }
          },
          fail: (err) => {
            // 修复：err 是 {errMsg} 对象而非 Error，需转换后才有 .message
            log.error('cert_submit_fail', { errMsg: err.errMsg });
            reject(new Error(err.errMsg || '网络请求失败'));
          }
        });
      });

      if (!this._current()) return;
      const profile = submission?.data;
      if (this._restricted) {
        if (profile?.certStatus !== 'approved' || profile.sessionType !== 'authenticated' ||
            !profile.token || !enterpriseSession.sameEnterprise(this._restricted.user, profile.user)) {
          throw new Error('认证结果尚未确认，请重试提交');
        }
        if (!this._visible) {
          this._pendingApproval = profile;
          return;
        }
        if (!this.finishRestrictedCertification(profile)) throw new Error('认证结果尚未确认，请重试提交');
        return;
      }

      if (!this._visible) return;
      if (profile?.certStatus !== 'approved') throw new Error('认证结果尚未确认，请重新查询');
      app.globalData.enterpriseCertification = profile;
      wx.hideLoading();
      wx.showToast({ title: '保存成功', icon: 'success' });

      // 切换到查看模式
      this.setData({
        mode: 'view',
        certStatus: profile.certStatus,
        returnReason: '',
        licenseImagePath: profile.licenseImage || licenseImagePath,
        licenseImageUrl: this.resolveLicenseImageUrl(profile.licenseImage || licenseImagePath)
      });

      if (this.data.continuingOrder && orderEntry.consume(app, this._entryId)) {
        this._entryId = null;
        wx.reLaunch({ url: '/pages/order/create/create' });
        return;
      }

      // 跳转到「我的」页面
      setTimeout(() => {
        if (!this._current() || !this._visible) return;
        wx.switchTab({
          url: '/pages/profile/profile/profile'
        });
      }, 1500);

    } catch (error) {
      if (!this._current()) return;
      if (this._restricted) this.setData({ continuationMessage: error.message || '请检查网络后重试' });
      if (!this._visible) return;
      log.error('cert_submit_catch', { message: error.message });
      wx.hideLoading();
      wx.showModal({ confirmColor: '#16835c',
        title: '提交失败',
        content: error.message || '请检查网络后重试',
        showCancel: true,
        confirmText: '重试',
        cancelText: '取消',
        success: (res) => {
          if (res.confirm && this._current() && this._visible) {
            this.submitCertification();
          }
        }
      });
    } finally {
      if (this._current()) this.setData({ submitting: false });
    }
  },

  finishRestrictedCertification(profile) {
    this._pendingApproval = null;
    if (!app.completeEnterpriseCertification(this._restricted, profile)) return false;
    wx.hideLoading();
    wx.showToast({ title: '认证成功', icon: 'success' });
    const account = orderEntry.key(app);
    const home = () => {
      if (orderEntry.key(app) === account) wx.switchTab({ url: '/pages/index/index' });
    };
    if (this._restricted.fromOrder) {
      wx.reLaunch({ url: '/pages/order/create/create?entry=enterprise-certification', fail: home });
    } else {
      home();
    }
    return true;
  }
});
