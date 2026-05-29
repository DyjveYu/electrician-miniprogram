// pages/profile/deposit/deposit.js
Page({
  data: {
    depositInfo: {
      status: null,
      paidAt: null,
      transactionId: null
    },
    configuredAmount: 200,
    statusText: '未缴纳',
    paying: false,
    refunding: false
  },

  onLoad() {
    this.loadDepositStatus();
  },

  onShow() {
    this.loadDepositStatus();
  },

  // 轮询查询押金状态（等待微信回调更新）
  pollDepositStatus(retryCount) {
    const maxRetries = 10;
    if (retryCount >= maxRetries) {
      wx.hideLoading();
      wx.showToast({ title: '支付结果查询超时，请稍后刷新页面', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '确认支付结果...', mask: true });

    const app = getApp();
    wx.request({
      url: `${app.globalData.baseUrl}/deposits/status`,
      method: 'GET',
      header: { 'Authorization': `Bearer ${app.globalData.token}` },
      success: (res) => {
        if (res.data.code === 200) {
          const data = res.data.data || {};
          // 如果状态已变为 paid，说明回调已处理
          if (data.status === 'paid') {
            wx.hideLoading();
            const statusMap = {
              'paid': '已缴纳',
              'pending': '待支付',
              'refunded': '已退款',
              'refunding': '退款中'
            };
            this.setData({
              depositInfo: {
                status: data.status || null,
                paidAt: data.paidAt ? this.formatDate(data.paidAt) : null,
                transactionId: data.transactionId || null
              },
              configuredAmount: data.configuredAmount || data.amount || 200,
              statusText: statusMap[data.status] || '未缴纳'
            });
            wx.showToast({ title: '押金缴纳成功', icon: 'success' });
            return;
          }
        }
        // 继续轮询
        setTimeout(() => {
          this.pollDepositStatus(retryCount + 1);
        }, 1000);
      },
      fail: () => {
        setTimeout(() => {
          this.pollDepositStatus(retryCount + 1);
        }, 1000);
      }
    });
  },

  // 获取押金状态
  loadDepositStatus() {
    const app = getApp();

    if (!app.globalData.token) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      setTimeout(() => {
        wx.reLaunch({ url: '/pages/login/login' });
      }, 100);
      return;
    }

    wx.request({
      url: `${app.globalData.baseUrl}/deposits/status`,
      method: 'GET',
      header: { 'Authorization': `Bearer ${app.globalData.token}` },
      success: (res) => {
        if (res.data.code === 200) {
          const data = res.data.data || {};
          const statusMap = {
            'paid': '已缴纳',
            'pending': '待支付',
            'refunded': '已退款',
            'refunding': '退款中'
          };
          this.setData({
            depositInfo: {
              status: data.status || null,
              paidAt: data.paidAt ? this.formatDate(data.paidAt) : null,
              transactionId: data.transactionId || null
            },
            configuredAmount: data.configuredAmount || data.amount || 200,
            statusText: statusMap[data.status] || '未缴纳'
          });
        } else {
          wx.showToast({ title: res.data.message || '获取押金状态失败', icon: 'none' });
        }
      },
      fail: () => {
        wx.showToast({ title: '网络错误', icon: 'none' });
      }
    });
  },

  // 格式化日期
  formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  },

  // 获取状态文本
  getStatusText() {
    const statusMap = {
      'paid': '已缴纳',
      'pending': '待支付',
      'refunded': '已退款',
      'refunding': '退款中'
    };
    return statusMap[this.data.depositInfo.status] || '未缴纳';
  },

  // 缴纳押金
  handlePay() {
    if (this.data.paying) return;

    const amount = this.data.configuredAmount;
    wx.showModal({
      title: '确认缴纳',
      content: `确定要缴纳${amount}元押金吗？`,
      success: (res) => {
        if (res.confirm) {
          this.createDepositOrder();
        }
      }
    });
  },

  // 创建押金支付订单
  createDepositOrder() {
    const app = getApp();
    this.setData({ paying: true });

    // 获取openid
    wx.login({
      success: (loginRes) => {
        if (!loginRes.code) {
          wx.showToast({ title: '获取授权失败', icon: 'none' });
          this.setData({ paying: false });
          return;
        }

        // 先获取openid
        wx.request({
          url: `${app.globalData.baseUrl}/auth/code2session`,
          method: 'POST',
          data: { code: loginRes.code },
          success: (sessionRes) => {
            const openid = sessionRes.data.data?.openid;
            if (!openid) {
              wx.showToast({ title: '获取用户信息失败', icon: 'none' });
              this.setData({ paying: false });
              return;
            }

            // 创建押金订单
            wx.request({
              url: `${app.globalData.baseUrl}/deposits/create`,
              method: 'POST',
              header: {
                'Authorization': `Bearer ${app.globalData.token}`,
                'Content-Type': 'application/json'
              },
              data: { openid },
              success: (createRes) => {
                if (createRes.data.code === 200 && createRes.data.data) {
                  const payParams = createRes.data.data.payParams;
                  // 调起微信支付
                  wx.requestPayment({
                    ...payParams,
                    success: (payResult) => {
                      wx.showToast({ title: '支付成功', icon: 'success' });
                      // 支付成功后轮询查询押金状态（等待微信回调更新）
                      this.pollDepositStatus(0);
                    },
                    fail: (payErr) => {
                      if (payErr.errMsg === 'requestPayment:fail cancel') {
                        wx.showToast({ title: '支付已取消', icon: 'none' });
                      } else {
                        wx.showToast({ title: '支付失败', icon: 'none' });
                      }
                    }
                  });
                } else {
                  wx.showToast({ title: createRes.data.message || '创建订单失败', icon: 'none' });
                }
              },
              fail: () => {
                wx.showToast({ title: '网络错误', icon: 'none' });
              },
              complete: () => {
                this.setData({ paying: false });
              }
            });
          },
          fail: () => {
            wx.showToast({ title: '获取openid失败', icon: 'none' });
            this.setData({ paying: false });
          }
        });
      },
      fail: () => {
        wx.showToast({ title: '获取授权失败', icon: 'none' });
        this.setData({ paying: false });
      }
    });
  },

  // 退回押金
  handleRefund() {
    if (this.data.refunding) return;

    wx.showModal({
      title: '申请退款',
      content: '确定要申请退回押金吗？审核通过后将在1-3个工作日内原路退回。',
      success: (res) => {
        if (res.confirm) {
          this.submitRefund('');
        }
      }
    });
  },

  // 提交退款申请
  submitRefund(reason) {
    const app = getApp();
    this.setData({ refunding: true });

    wx.request({
      url: `${app.globalData.baseUrl}/deposits/refund`,
      method: 'POST',
      header: {
        'Authorization': `Bearer ${app.globalData.token}`,
        'Content-Type': 'application/json'
      },
      data: { reason },
      success: (res) => {
        if (res.data.code === 200) {
          wx.showToast({ title: '退款申请已提交，请等待审核', icon: 'success' });
          setTimeout(() => {
            this.loadDepositStatus();
          }, 1500);
        } else {
          wx.showToast({ title: res.data.message || '退款申请失败', icon: 'none' });
        }
      },
      fail: () => {
        wx.showToast({ title: '网络错误', icon: 'none' });
      },
      complete: () => {
        this.setData({ refunding: false });
      }
    });
  }
});
