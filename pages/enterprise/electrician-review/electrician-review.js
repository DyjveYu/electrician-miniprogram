// pages/enterprise/electrician-review/electrician-review.js
const app = getApp();

Page({
  data: {
    orderId: '',
    orderNo: '',
    loading: false,
    rating: 5,
    comment: '',
    submitting: false
  },

  onLoad(options) {
    if (options.orderId) {
      this.setData({ orderId: options.orderId });
    } else {
      wx.showToast({ title: '参数错误', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
    }
  },

  setRating(e) {
    const value = Number(e.currentTarget.dataset.value) || 1;
    this.setData({ rating: value });
  },

  onCommentInput(e) {
    this.setData({ comment: e.detail.value });
  },

  submitReview() {
    const { rating } = this.data;
    if (!rating || rating < 1 || rating > 5) {
      wx.showToast({ title: '请选择评分', icon: 'none' });
      return;
    }

    if (this.data.submitting) return;
    this.setData({ submitting: true });

    const app = getApp();
    wx.request({
      url: `${app.globalData.baseUrl}/miniprogram/enterprise/orders/${this.data.orderId}/electrician-review`,
      method: 'POST',
      header: { Authorization: `Bearer ${app.globalData.token}` },
      data: {
        rating: this.data.rating,
        comment: this.data.comment
      },
      success: (res) => {
        this.setData({ submitting: false });
        const ok = res?.data?.code === 0 || res?.data?.code === 200 || res?.data?.success === true;
        if (ok) {
          wx.showToast({ title: '评价成功', icon: 'success' });
          setTimeout(() => wx.switchTab({ url: '/pages/order/list/list' }), 1500);
        } else {
          wx.showToast({ title: res?.data?.message || '评价失败', icon: 'none' });
        }
      },
      fail: () => {
        this.setData({ submitting: false });
        wx.showToast({ title: '网络错误', icon: 'none' });
      }
    });
  }
});
