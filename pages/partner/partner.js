// pages/partner/partner.js
Page({
  data: {
    loading: true,
    months: [],
    selectedMonth: '',
    partnerInfo: {
      name: '',
      commissionRate: '',
      areas: []
    },
    current: null,
    electricians: []
  },

  onLoad() {
    this.loadData();
  },

  loadData(month) {
    const app = getApp();
    if (!app.globalData.token) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }

    this.setData({ loading: true });

    const statsParams = month ? { month } : {};

    // 并行请求：统计数据 + 电工列表
    const statsReq = new Promise((resolve, reject) => {
      wx.request({
        url: `${app.globalData.baseUrl}/partner/stats`,
        method: 'GET',
        data: statsParams,
        header: { 'Authorization': `Bearer ${app.globalData.token}` },
        success: (res) => resolve(res),
        fail: (err) => reject(err)
      });
    });

    const listReq = new Promise((resolve, reject) => {
      wx.request({
        url: `${app.globalData.baseUrl}/partner/electricians`,
        method: 'GET',
        header: { 'Authorization': `Bearer ${app.globalData.token}` },
        success: (res) => resolve(res),
        fail: (err) => reject(err)
      });
    });

    Promise.all([statsReq, listReq])
      .then(([statsRes, listRes]) => {
        this.setData({ loading: false });

        if (statsRes.data && statsRes.data.code === 200) {
          const data = statsRes.data.data || {};
          this.setData({
            partnerInfo: data.partnerInfo || this.data.partnerInfo,
            months: data.months || [],
            selectedMonth: data.current ? data.current.statMonth : '',
            current: data.current
          });
        } else {
          wx.showToast({ title: '获取统计数据失败', icon: 'none' });
        }

        if (listRes.data && listRes.data.code === 200) {
          const data = listRes.data.data || {};
          this.setData({ electricians: data.list || [] });
        }
      })
      .catch(() => {
        this.setData({ loading: false });
        wx.showToast({ title: '网络错误，请重试', icon: 'none' });
      });
  },

  onMonthChange(e) {
    const month = this.data.months[e.detail.value];
    if (month) {
      this.loadData(month);
    }
  },

  onPullDownRefresh() {
    this.loadData(this.data.selectedMonth);
    wx.stopPullDownRefresh();
  }
});
