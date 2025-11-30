// pages/payment/result/result.js
Page({
  data: {
    status: 'success', // success, fail
    orderId: '',
    order: null
  },

  onLoad(options) {
    this.setData({
      status: options.status || 'success',
      orderId: options.orderId || ''
    });
    
    if (this.data.orderId) {
      this.loadOrderInfo();
    }
  },

  // 加载订单信息
  loadOrderInfo() {
    const app = getApp();
    wx.request({
      url: `${app.globalData.baseUrl}/orders/${this.data.orderId}`,
      method: 'GET',
      header: {
        'Authorization': `Bearer ${app.globalData.token}`
      },
      success: (res) => {
        if (res.data.code === 0) {
          this.setData({ order: res.data.data });
        }
      }
    });
  },

  // 查看订单详情
  viewOrderDetail() {
    wx.redirectTo({
      url: `/pages/order/detail/detail?id=${this.data.orderId}`
    });
  },

  // 返回首页
  goHome() {
    wx.switchTab({
      url: '/pages/index/index'
    });
  }
});