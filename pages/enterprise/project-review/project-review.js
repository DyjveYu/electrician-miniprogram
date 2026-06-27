// pages/enterprise/project-review/project-review.js
const app = getApp();

Page({
  data: {
    orderId: '',
    orderStatus: '',
    electricians: [],
    loading: true,
    // 每个电工独立的评分和评论状态
    ratings: {},       // { electricianId: rating }
    comments: {},      // { electricianId: comment }
    submitting: {}     // { electricianId: true/false }
  },

  onLoad(options) {
    if (options.orderId) {
      this.setData({ orderId: options.orderId });
      this.loadElectricians();
    } else {
      wx.showToast({ title: '参数错误', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
    }
  },

  loadElectricians() {
    const app = getApp();
    wx.request({
      url: `${app.globalData.baseUrl}/miniprogram/enterprise/orders/${this.data.orderId}/electricians`,
      method: 'GET',
      header: { Authorization: `Bearer ${app.globalData.token}` },
      success: (res) => {
        this.setData({ loading: false });
        const ok = res?.data?.code === 0 || res?.data?.code === 200 || res?.data?.success === true;
        if (ok) {
          const data = res.data.data || res.data;
          const list = (data.list || []).map(item => ({
            ...item,
            statusText: this.getElectricianStatusText(item.status)
          }));

          // 初始化评分（默认五星）和评论
          const ratings = {};
          const comments = {};
          list.forEach(item => {
            if (item.status === 'pending_review' || item.status === 'pending_second_review') {
              ratings[item.electricianId] = 5;
              comments[item.electricianId] = '';
            }
          });

          this.setData({
            electricians: list,
            orderStatus: this.getOrderStatusText(data.orderStatus),
            ratings,
            comments
          });
        } else {
          wx.showToast({ title: res.data.message || '加载失败', icon: 'none' });
        }
      },
      fail: () => {
        this.setData({ loading: false });
        wx.showToast({ title: '网络错误', icon: 'none' });
      }
    });
  },

  getOrderStatusText(status) {
    const map = {
      'pending_payment': '待支付预付款',
      'pending': '待接单',
      'accepted': '已接单',
      'in_progress': '维修中',
      'pending_review': '待评价',
      'pending_second_review': '待二次评价',
      'completed_settled': '已完成已结算',
      'completed_settle_failed': '已完成结算失败',
      'completed_unsettle': '已完成未结算',
      'pending_repair_payment': '待支付维修费',
      'paid': '已支付',
      'cancelled': '已取消',
      'cancel_pending': '取消处理中',
      'closed': '交易关闭',
      'recruiting': '招募中',
      'full': '已满员',
      'reviewing': '评价中'
    };
    return map[status] || status;
  },

  getElectricianStatusText(status) {
    const map = {
      'pending_review': '待评价',
      'pending_second_review': '待二次评价',
      'completed_settled': '已结算',
      'completed_unsettle': '未结算',
      'in_progress': '进行中'
    };
    return map[status] || status;
  },

  setRating(e) {
    const electricianId = e.currentTarget.dataset.id;
    const value = Number(e.currentTarget.dataset.value) || 1;
    const ratings = { ...this.data.ratings };
    ratings[electricianId] = value;
    this.setData({ ratings });
  },

  onCommentInput(e) {
    const electricianId = e.currentTarget.dataset.id;
    const comments = { ...this.data.comments };
    comments[electricianId] = e.detail.value;
    this.setData({ comments });
  },

  submitReview(e) {
    const electricianId = e.currentTarget.dataset.id;
    const rating = this.data.ratings[electricianId];
    const comment = this.data.comments[electricianId] || '';

    if (!rating || rating < 1 || rating > 5) {
      wx.showToast({ title: '请选择评分', icon: 'none' });
      return;
    }

    if (this.data.submitting[electricianId]) return;
    const submitting = { ...this.data.submitting };
    submitting[electricianId] = true;
    this.setData({ submitting });

    const app = getApp();
    wx.request({
      url: `${app.globalData.baseUrl}/miniprogram/enterprise/orders/${this.data.orderId}/review`,
      method: 'POST',
      header: { Authorization: `Bearer ${app.globalData.token}` },
      data: { electricianId, rating, comment },
      success: (res) => {
        submitting[electricianId] = false;
        this.setData({ submitting });

        const ok = res?.data?.code === 0 || res?.data?.code === 200 || res?.data?.success === true;
        if (ok) {
          wx.showToast({ title: '评价成功', icon: 'success' });
          // 刷新列表
          this.loadElectricians();
        } else {
          wx.showToast({ title: res?.data?.message || '评价失败', icon: 'none' });
        }
      },
      fail: () => {
        submitting[electricianId] = false;
        this.setData({ submitting });
        wx.showToast({ title: '网络错误', icon: 'none' });
      }
    });
  },

  // 跳转订单详情
  goToOrderDetail() {
    wx.navigateTo({
      url: `/pages/order/detail/detail?id=${this.data.orderId}`
    });
  }
});
