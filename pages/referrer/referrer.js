// pages/referrer/referrer.js
Page({
  data: {
    referrerInfo: null,
    loading: true
  },

  onLoad() {
    // 不需要启用原生分享
  },

  onShow() {
    this.loadReferrerInfo();
  },

  loadReferrerInfo() {
    const app = getApp();
    this.setData({ loading: true });

    wx.request({
      url: `${app.globalData.baseUrl}/user-referrers/info`,
      method: 'GET',
      header: { 'Authorization': `Bearer ${app.globalData.token}` },
      success: (res) => {
        if (res.data && res.data.code === 200) {
          this.setData({
            referrerInfo: res.data.data,
            loading: false
          });
        } else {
          this.setData({ loading: false });
        }
      },
      fail: () => {
        this.setData({ loading: false });
        wx.showToast({ title: '网络错误', icon: 'none' });
      }
    });
  },
  copyShareLink() {
    const app = getApp();
    const userId = app.globalData.userInfo?.id;

    wx.showLoading({ title: '生成链接中...' });

    wx.request({
      url: `${app.globalData.baseUrl}/miniprogram/url-link`,
      method: 'POST',
      header: { 'Authorization': `Bearer ${app.globalData.token}` },
      data: {
        path: 'pages/index/index',
        query: `referrer_id=${userId}`
      },
      success: (res) => {
        wx.hideLoading();
        const ok = res.data && (res.data.code === 200 || res.data.success);
        if (ok && res.data.data?.url) {
          wx.setClipboardData({
            data: res.data.data.url,
            success: () => {
              wx.showToast({ title: '链接已复制', icon: 'success' });
            }
          });
        } else {
          wx.showToast({ title: res.data?.message || '链接生成失败，请使用下方转发功能', icon: 'none' });
        }
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({ title: '网络错误，请使用下方转发功能', icon: 'none' });
      }
    });
  },

  // ── 跳转到分享落地页（测试用） ──
  jumpToShareLink() {
    const app = getApp();
    const userId = app.globalData.userInfo?.id;
    if (!userId) {
      wx.showToast({ title: '用户信息未加载', icon: 'none' });
      return;
    }
    wx.redirectTo({
      url: `/pages/order-landing/index?referrer_id=${userId}`
    });
  },

  // ── 下载二维码（调用后端小程序码接口） ──
  downloadQRCode() {
    const app = getApp();
    const userId = app.globalData.userInfo?.id;
    wx.showLoading({ title: '生成中...' });

    wx.request({
      url: `${app.globalData.baseUrl}/miniprogram/qrcode`,
      method: 'POST',
      header: { 'Authorization': `Bearer ${app.globalData.token}` },
      data: {
        scene: String(userId),
        page: 'pages/order-landing/index'
      },
      success: (res) => {
        wx.hideLoading();
        const ok = res.data && (res.data.code === 200 || res.data.success);
        if (ok && res.data.data?.qrcode_url) {
          // 拼接完整 URL：baseUrl(http://host:port/api) 去掉 /api 后加上图片路径
          const base = app.globalData.baseUrl.replace(/\/api$/, '');
          const fullUrl = base + res.data.data.qrcode_url;
          wx.downloadFile({
            url: fullUrl,
            success: (downloadRes) => {
              if (downloadRes.statusCode === 200) {
                wx.saveImageToPhotosAlbum({
                  filePath: downloadRes.tempFilePath,
                  success: () => {
                    wx.showToast({ title: '二维码已保存', icon: 'success' });
                  },
                  fail: () => {
                    wx.showToast({ title: '保存失败，请授权相册权限', icon: 'none' });
                  }
                });
              } else {
                wx.showToast({ title: '下载失败', icon: 'none' });
              }
            },
            fail: () => {
              wx.showToast({ title: '下载失败', icon: 'none' });
            }
          });
        } else {
          wx.showToast({ title: res.data?.message || '二维码生成失败', icon: 'none' });
        }
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({ title: '网络错误', icon: 'none' });
      }
    });
  }
});
