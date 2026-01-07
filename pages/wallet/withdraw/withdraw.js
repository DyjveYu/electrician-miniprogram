Page({
  data: {
    wallet: {
      available_balance: 0,
      total_income: 0,
      withdrawn_amount: 0
    },
    withdrawAmount: '',
    canWithdraw: false,
    submitting: false
  },

  onLoad() {
    this.loadWalletInfo();
  },

  loadWalletInfo() {
    const app = getApp();
    wx.request({
      url: `${app.globalData.baseUrl}/electricians/income`,
      method: 'GET',
      header: { 'Authorization': `Bearer ${app.globalData.token}` },
      success: (res) => {
        if (res.data.success) {
          this.setData({ wallet: res.data.data });
        }
      }
    });
  },

  onAmountInput(e) {
    let value = e.detail.value;
    // Limit decimals to 2
    if (value.includes('.')) {
      const parts = value.split('.');
      if (parts[1] && parts[1].length > 2) {
        value = parseFloat(value).toFixed(2);
      }
    }
    
    const amount = parseFloat(value);
    const balance = this.data.wallet.available_balance;
    
    // Check validity (最低提现金额 0.02 元)
    const isValid = !isNaN(amount) && amount > 0 && amount <= balance && amount >= 0.02;

    this.setData({
      withdrawAmount: value,
      canWithdraw: isValid
    });
  },

  handleWithdrawAll() {
    const balance = this.data.wallet.available_balance;
    this.setData({
      withdrawAmount: balance.toString(),
      canWithdraw: balance >= 0.02 //最低提现金额设置
    });
  },

  handleWithdraw() {
    if (!this.data.canWithdraw || this.data.submitting) return;

    const amount = parseFloat(this.data.withdrawAmount);
    
    wx.showModal({
      title: '确认提现',
      content: `确认提现 ¥${amount} 到微信零钱？`,
      success: (res) => {
        if (res.confirm) {
          this.doWithdraw(amount);
        }
      }
    });
  },

  doWithdraw(amount) {
    this.setData({ submitting: true });
    const app = getApp();

    wx.request({
      url: `${app.globalData.baseUrl}/electricians/withdraw`,
      method: 'POST',
      header: { 'Authorization': `Bearer ${app.globalData.token}` },
      data: { amount },
      success: (res) => {
        if (res.data.success) {
          wx.showToast({
            title: '提现成功',
            icon: 'success'
          });
          // Refresh wallet info
          this.loadWalletInfo();
          this.setData({ withdrawAmount: '', canWithdraw: false });
        } else {
          wx.showModal({
            title: '提现失败',
            content: res.data.message || '未知错误',
            showCancel: false
          });
        }
      },
      fail: (err) => {
        wx.showModal({
          title: '请求失败',
          content: '网络错误，请稍后重试',
          showCancel: false
        });
      },
      complete: () => {
        this.setData({ submitting: false });
      }
    });
  }
});
