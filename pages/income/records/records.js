/**
 * 提现记录列表页
 * 展示推荐达人/合作伙伴的提现记录
 */
Page({
  data: {
    records: [],
    page: 1,
    pageSize: 20,
    total: 0,
    loading: false,
    hasMore: true
  },

  onLoad() {
    this.loadRecords(1);
  },

  onPullDownRefresh() {
    this.loadRecords(1, () => {
      wx.stopPullDownRefresh();
    });
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadRecords(this.data.page + 1);
    }
  },

  loadRecords(page, callback) {
    if (this.data.loading) return;
    this.setData({ loading: true });

    const app = getApp();
    wx.request({
      url: `${app.globalData.baseUrl}/referrer-income/withdrawals`,
      method: 'GET',
      header: { 'Authorization': `Bearer ${app.globalData.token}` },
      data: { page, page_size: this.data.pageSize },
      success: (res) => {
        if (res.data && (res.data.code === 200 || res.data.success)) {
          const data = res.data.data || {};
          const list = data.list || [];
          this.setData({
            records: page === 1 ? list : [...this.data.records, ...list],
            total: data.total || 0,
            page: page,
            hasMore: list.length === this.data.pageSize
          });
        }
      },
      fail: () => {
        wx.showToast({ title: '网络错误', icon: 'none' });
      },
      complete: () => {
        this.setData({ loading: false });
        if (callback) callback();
      }
    });
  },

  getStatusText(status) {
    const map = {
      pending: '待处理',
      processing: '处理中',
      success: '已到账',
      failed: '失败',
      cancelled: '已取消'
    };
    return map[status] || status;
  },

  getStatusClass(status) {
    const map = {
      success: 'status-success',
      processing: 'status-processing',
      pending: 'status-pending',
      failed: 'status-failed',
      cancelled: 'status-cancelled'
    };
    return map[status] || '';
  }
});
