/**
 * 修复后的小程序代码 - withdraw.js
 * 正确处理用户取消收款的情况
 */

Page({
  data: {
    wallet: {
      available_balance: 0,
      total_income: 0,
      withdrawn_amount: 0,
      locked_amount: 0  // ✅ 新增：锁定中金额
    },
    withdrawAmount: '',
    canWithdraw: false,
    submitting: false
  },

  onLoad() {
    this.loadWalletInfo();
  },

  onShow() {
    // 页面显示时刷新余额
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
    if (value.includes('.')) {
      const parts = value.split('.');
      if (parts[1] && parts[1].length > 2) {
        value = parseFloat(value).toFixed(2);
      }
    }
    
    const amount = parseFloat(value);
    const balance = this.data.wallet.available_balance;
    const isValid = !isNaN(amount) && amount >= 0.1 && amount <= balance;

    this.setData({
      withdrawAmount: value,
      canWithdraw: isValid
    });
  },

  handleWithdrawAll() {
    const balance = this.data.wallet.available_balance;
    this.setData({
      withdrawAmount: balance.toString(),
      canWithdraw: balance >= 0.1
    });
  },

  handleWithdraw() {
    if (!this.data.canWithdraw || this.data.submitting) return;

    const amount = parseFloat(this.data.withdrawAmount);
    
    wx.showModal({
      title: '确认提现',
      content: `确认提现 ¥${amount.toFixed(2)} 到微信零钱？`,
      success: (res) => {
        if (res.confirm) {
          this.doWithdraw(amount);
        }
      }
    });
  },

  doWithdraw(amount) {
    console.log('🚀 开始提现，金额:', amount);
    this.setData({ submitting: true });
    const app = getApp();

    wx.request({
      url: `${app.globalData.baseUrl}/electricians/withdraw`,
      method: 'POST',
      header: { 
        'Authorization': `Bearer ${app.globalData.token}`,
        'Content-Type': 'application/json'
      },
      data: { amount },
      success: (res) => {
        console.log('✅ 提现接口返回:', res.data);
        
        if (res.data.success) {
          const { state, package_info, out_batch_no } = res.data.data;
          
          if (state === 'WAIT_USER_CONFIRM' && package_info) {
            console.log('✅ 需要用户确认，准备拉起确认页');
            this.requestMerchantTransfer(package_info, out_batch_no);
          } else {
            console.log('✅ 转账处理中或已成功');
            wx.showToast({
              title: '提现申请已提交',
              icon: 'success'
            });
            setTimeout(() => {
              this.loadWalletInfo();
              this.setData({ withdrawAmount: '', canWithdraw: false });
            }, 1500);
          }
        } else {
          wx.showModal({
            title: '提现失败',
            content: res.data.message || '未知错误',
            showCancel: false
          });
        }
      },
      fail: (err) => {
        console.error('❌ 提现请求失败:', err);
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
  },

  /**
   * ⭐ 拉起微信收款确认页面
   */
  requestMerchantTransfer(packageInfo, outBatchNo) {
    console.log('📱 准备调起用户确认收款页');
    console.log('📦 out_batch_no:', outBatchNo);

    if (!wx.canIUse('requestMerchantTransfer')) {
      wx.showModal({
        title: '提示',
        content: '你的微信版本过低，请更新至最新版本后重试',
        showCancel: false
      });
      return;
    }

    const app = getApp();
    const savedToken = app.globalData.token;
    const savedBaseUrl = app.globalData.baseUrl;
    
    const mchId = app.globalData.mchId || '1103388382';
    const appId = wx.getAccountInfoSync().miniProgram.appId;
    
    console.log('📦 调用参数:', { mchId, appId });
    
    wx.requestMerchantTransfer({
      mchId: mchId,
      appId: appId,
      package: packageInfo,
      
      success: (res) => {
        console.log('✅ 用户确认收款成功:', res);
        
        wx.showLoading({
          title: '确认中...',
          mask: true
        });
        
        // 延迟3秒后查询状态（给微信处理时间）
        setTimeout(() => {
          this.queryStatusWithRetry(outBatchNo, savedToken, savedBaseUrl, 0, false);
        }, 3000);
      },
      
      fail: (err) => {
        console.error('❌ 收款确认失败或用户取消:', err);

        // 判断是否为用户在转账确认页点击“取消”或关闭页面的场景
        if (err.errMsg && (err.errMsg.includes('cancel') || err.errMsg.includes('Cancel'))) {
          console.log('🚫 用户点击取消');

          // 提示用户当前正在执行“撤销提现”的后台操作
          wx.showLoading({
            title: '正在取消...',
            mask: true
          });

          // 调用后端撤销接口，由服务端主动调用微信撤销转账 API
          wx.request({
            url: `${savedBaseUrl}/electricians/withdrawals/${outBatchNo}/cancel`,
            method: 'POST',
            header: {
              'Authorization': `Bearer ${savedToken}`,
              'Content-Type': 'application/json'
            },
            success: (res) => {
              console.log('✅ 撤销接口返回:', res.data);

              wx.hideLoading();

              if (res.data && res.data.success) {
                // 撤销受理成功，本地视为已取消，提示用户结果并刷新钱包数据
                wx.showModal({
                  title: '已取消',
                  content: '您已取消本次提现',
                  showCancel: false,
                  success: () => {
                    this.loadWalletInfo();
                  }
                });
              } else {
                // 撤销业务失败（例如参数错误、状态不允许撤销等）
                wx.showModal({
                  title: '撤销失败',
                  content: (res.data && res.data.message) || '撤销失败，请稍后重试',
                  showCancel: false,
                  success: () => {
                    this.loadWalletInfo();
                  }
                });
              }
            },
            fail: (cancelErr) => {
              // 网络层面错误，无法确认撤销是否成功，让用户稍后在提现记录中核对
              console.error('❌ 撤销请求失败:', cancelErr);
              wx.hideLoading();

              wx.showModal({
                title: '网络错误',
                content: '撤销请求失败，请稍后在提现记录中确认结果',
                showCancel: false,
                success: () => {
                  this.loadWalletInfo();
                }
              });
            }
          });
        } else {
          // 非取消场景：例如接口异常或其他错误，按通用错误提示处理
          wx.hideLoading();
          wx.showModal({
            title: '提示',
            content: err.errMsg || '操作失败，请稍后重试',
            showCancel: false,
            success: () => {
              this.loadWalletInfo();
            }
          });
        }
      }
    });
  },

  /**
   * ⭐ 新增：带重试机制的状态查询
   * @param {string} outBatchNo - 订单号
   * @param {string} token - 认证token
   * @param {string} baseUrl - API基础URL
   * @param {number} retryCount - 当前重试次数
   * @param {boolean} userCancelled - 是否是用户取消
   * @param {number} maxRetries - 最大重试次数
   */
  queryStatusWithRetry(outBatchNo, token, baseUrl, retryCount = 0, userCancelled = false, maxRetries = 5) {
    console.log(`🔍 [重试${retryCount}/${maxRetries}] 查询状态: ${outBatchNo}`);
    
    if (!token) {
      console.error('❌ token 为空');
      wx.hideLoading();
      wx.showModal({
        title: '提示',
        content: '登录状态失效，请重新登录',
        showCancel: false,
        success: () => {
          wx.reLaunch({ url: '/pages/login/login' });
        }
      });
      return;
    }
    
    const requestUrl = `${baseUrl}/electricians/withdrawals/${outBatchNo}/status`;
    
    wx.request({
      url: requestUrl,
      method: 'GET',
      header: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      success: (res) => {
        console.log('✅ 查询返回:', res.data);
        
        if (res.data.success) {
          const { status, fail_reason, wechat_state } = res.data.data;
          
          console.log('📊 状态:', status, '微信状态:', wechat_state);
          
          // ✅ 检查是否是终态
          const isFinalState = ['success', 'failed', 'cancelled'].includes(status);
          
          if (isFinalState) {
            // 已经是终态，处理结果
            wx.hideLoading();
            this.handleFinalStatus(status, fail_reason, userCancelled);
          } else if (retryCount < maxRetries) {
            // ✅ 仍在处理中且未达到最大重试次数，继续重试
            console.log(`⏰ 仍在处理中，${2}秒后重试...`);
            
            setTimeout(() => {
              this.queryStatusWithRetry(outBatchNo, token, baseUrl, retryCount + 1, userCancelled, maxRetries);
            }, 2000);  // 每2秒重试一次
            
          } else {
            // 达到最大重试次数，停止重试
            console.log('⚠️ 达到最大重试次数');
            wx.hideLoading();
            
            wx.showModal({
              title: '提示',
              content: '转账正在处理中，请稍后在提现记录中查看结果',
              showCancel: false,
              success: () => {
                this.loadWalletInfo();
                wx.navigateBack();
              }
            });
          }
        } else {
          wx.hideLoading();
          wx.showModal({
            title: '查询失败',
            content: res.data.message || '状态查询失败',
            showCancel: false
          });
        }
      },
      fail: (err) => {
        console.error('❌ 查询失败:', err);
        wx.hideLoading();
        
        wx.showModal({
          title: '网络错误',
          content: '状态查询失败，请稍后在提现记录中查看',
          showCancel: false
        });
      }
    });
  },

  /**
   * ⭐ 新增：处理最终状态
   */
  handleFinalStatus(status, failReason, userCancelled) {
    console.log('🎯 处理最终状态:', status);
    
    if (status === 'success') {
      // ✅ 转账成功
      wx.showToast({
        title: '提现成功！',
        icon: 'success',
        duration: 2000
      });
      
      setTimeout(() => {
        this.loadWalletInfo();
        this.setData({ 
          withdrawAmount: '', 
          canWithdraw: false 
        });
      }, 2000);
      
    } else if (status === 'cancelled') {
      // ✅ 已取消
      wx.showModal({
        title: '已取消',
        content: userCancelled ? '您已取消本次提现' : '转账已撤销',
        showCancel: false,
        success: () => {
          this.loadWalletInfo();
        }
      });
      
    } else if (status === 'failed') {
      // ❌ 转账失败
      wx.showModal({
        title: '提现失败',
        content: failReason || '转账失败，请稍后重试',
        showCancel: false,
        success: () => {
          this.loadWalletInfo();
        }
      });
    }
  }
});
