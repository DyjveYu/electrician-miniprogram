/**
 * 收入首页
 * 展示推荐达人/合作伙伴的累计佣金、已提现、可用余额
 */
Page({
  data: {
    balance: {
      is_referrer: false,
      referrer_type: '',
      total_commission: 0,
      withdrawn: 0,
      locked_amount: 0,
      available_balance: 0
    },
    loading: true
  },

  onShow() {
    this.loadBalance();
  },

  loadBalance() {
    const app = getApp();
    this.setData({ loading: true });

    wx.request({
      url: `${app.globalData.baseUrl}/referrer-income/balance`,
      method: 'GET',
      header: { 'Authorization': `Bearer ${app.globalData.token}` },
      success: (res) => {
        if (res.data && (res.data.code === 200 || res.data.success)) {
          this.setData({ balance: res.data.data || {} });
        } else {
          wx.showToast({ title: res.data?.message || '加载失败', icon: 'none' });
        }
      },
      fail: () => {
        wx.showToast({ title: '网络错误', icon: 'none' });
      },
      complete: () => {
        this.setData({ loading: false });
      }
    });
  },

  // 跳转到提现页
  navigateToWithdraw() {
    wx.navigateTo({
      url: '/pages/income/withdraw/withdraw'
    });
  },

  // 跳转到提现记录
  navigateToRecords() {
    wx.navigateTo({
      url: '/pages/income/records/records'
    });
  },

  // 获取角色名称
  getRoleName(type) {
    const map = { promoter: '推荐达人', partner: '合作伙伴' };
    return map[type] || '';
  }
});
