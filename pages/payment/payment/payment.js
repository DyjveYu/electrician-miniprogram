// pages/payment/payment/payment.js
const { PaymentAPI } = require('../../../utils/api');

Page({
  data: {
    orderId: '',
    order: null,
    paying: false,
    // 根据订单状态或入参自动判定：'prepay' | 'repair'
    payType: 'prepay',
    // 展示在页面上的支付金额（来自创建支付的返回）
    payAmount: 0,
    // 支付单号,用于查询支付状态
    paymentNo: ''
  },

  onLoad(options) {
    if (options.orderId && options.orderId !== 'undefined') {
      this.setData({ orderId: options.orderId });
      this.loadOrderInfo();
    } else {
      wx.showToast({ title: '订单信息错误', icon: 'none' });
      setTimeout(() => {
        wx.switchTab({ url: '/pages/order/list/list' });
      }, 1500);
    }
    // 可支持直接通过参数指定支付类型
    if (options.type && (options.type === 'prepay' || options.type === 'repair')) {
      this.setData({ payType: options.type });
    }
  },

  // 加载订单信息后自动发起支付
  loadOrderInfo() {
    const app = getApp();
    wx.request({
      url: `${app.globalData.baseUrl}/orders/${this.data.orderId}`,
      method: 'GET',
      header: {
        'Authorization': `Bearer ${app.globalData.token}`
      },
      success: (res) => {
        if (res.data.code === 0 || res.data.code === 200) {
          const order = res.data.data;
          // 根据订单状态判定支付类型
          const typeByStatus = order.status === 'pending_repair_payment' ? 'repair' : 'prepay';
          this.setData({ order, payType: this.data.payType || typeByStatus });
          // 自动拉起支付
          this.startPayment();
        } else {
          wx.showToast({ title: res.data.message || '加载订单失败', icon: 'none' });
        }
      },
      fail: () => {
        wx.showToast({ title: '网络错误', icon: 'none' });
      }
    });
  },

  // 发起微信支付（自动）
  async startPayment() {
    if (this.data.paying) return;
    this.setData({ paying: true });

    try {
      const app = getApp();
      const isDev = /localhost|127\.0\.0\.1|:3000/.test(app.globalData.baseUrl || '');
      // 优先使用全局配置；未设置时：开发走测试，生产走微信
      const method = app.globalData.paymentMethod || (isDev ? 'test' : 'wechat');
      const openid = method === 'wechat' ? await this.resolveOpenId() : undefined;
      const result = await PaymentAPI.createPayment({
        order_id: this.data.orderId,
        payment_method: method,
        type: this.data.payType,
        openid
      });

      this.setData({ paying: false });

      // API 封装返回的是 { code, message, data }
      const payload = result.data || result;
      if (payload && (payload.success || payload.pay_params)) {
        // 展示金额
        if (typeof payload.amount !== 'undefined') {
          this.setData({ payAmount: Number(payload.amount) || 0 });
        }
        const payParams = payload.pay_params || payload;
        // 保存payment_no用于后续查询支付状态
        this.setData({ paymentNo: payload.payment_no });
        if (method === 'wechat') {
          this.processPayment(payParams);
        } else {
          // 测试支付：直接跳转为成功
          this.paymentSuccess();
        }
      } else {
        wx.showToast({ title: (result.message || '支付创建失败'), icon: 'none' });
      }
    } catch (err) {
      this.setData({ paying: false });
      wx.showToast({ title: err.message || '支付异常', icon: 'none' });
    }
  },

  // 拉起微信支付
  processPayment(payParams) {
    console.log('[支付页] 拉起微信支付, payParams:', payParams);
    wx.requestPayment({
      timeStamp: String(payParams.timeStamp),
      nonceStr: payParams.nonceStr,
      package: payParams.package,
      signType: payParams.signType || 'RSA',
      paySign: payParams.paySign,
      success: (res) => {
        console.log('[支付页] 微信支付成功回调', res);
        // 支付成功后,主动查询支付状态(作为回调失败的备用方案)
        this.pollPaymentStatus(payParams.package);
      },
      fail: () => {
        console.error('[支付页] 微信支付失败');
        wx.showToast({ title: '支付失败，请重新发起支付', icon: 'none' });
        // 失败后按要求跳转：先到“我的订单”Tab，再进入订单详情
        wx.switchTab({
          url: '/pages/order/list/list',
          success: () => {
            setTimeout(() => {
              wx.navigateTo({
                url: `/pages/order/detail/detail?orderId=${this.data.orderId}`
              });
            }, 50);
          }
        });
      }
    });
  },

  // 轮询查询支付状态(作为微信回调的备用方案)
  pollPaymentStatus(packageStr) {
    console.log('[支付页] 开始轮询支付状态...');

    // 显示加载提示
    wx.showLoading({ title: '确认支付结果...', mask: true });

    let pollCount = 0;
    const maxPolls = 10; // 最多轮询10次
    const pollInterval = 1000; // 每次间隔1秒

    const checkStatus = () => {
      pollCount++;
      console.log(`[支付页] 第 ${pollCount} 次查询支付状态`);

      const app = getApp();

      // 【测试回调模式】注释掉主动查询支付状态的代码，仅通过轮询订单状态来验证微信回调是否生效
      // if (this.data.paymentNo) {
      //   wx.request({
      //     url: `${app.globalData.baseUrl}/payments/${this.data.paymentNo}`,
      //     method: 'GET',
      //     header: { 'Authorization': `Bearer ${app.globalData.token}` },
      //     success: (paymentRes) => {
      //       console.log('[支付页] 支付状态查询结果:', paymentRes.data);
      //       // 支付状态查询完成后,再查询订单状态
      //       this.queryOrderStatus(pollCount, maxPolls, pollInterval, checkStatus);
      //     },
      //     fail: (err) => {
      //       console.error('[支付页] 支付状态查询失败:', err);
      //       // 即使失败也继续查询订单
      //       this.queryOrderStatus(pollCount, maxPolls, pollInterval, checkStatus);
      //     }
      //   });
      // } else {
      //   // 没有paymentNo,直接查询订单
      //   this.queryOrderStatus(pollCount, maxPolls, pollInterval, checkStatus);
      // }

      // 直接查询订单状态（测试回调专用）
      this.queryOrderStatus(pollCount, maxPolls, pollInterval, checkStatus);
    };

    // 开始第一次查询
    checkStatus();
  },

  // 查询订单状态的方法
  queryOrderStatus(pollCount, maxPolls, pollInterval, checkStatus) {
    const app = getApp();
    // 查询订单详情,检查订单状态是否已更新
    wx.request({
      url: `${app.globalData.baseUrl}/orders/${this.data.orderId}`,
      method: 'GET',
      header: { 'Authorization': `Bearer ${app.globalData.token}` },
      success: (res) => {
        console.log('[支付页] 订单详情查询结果:', res.data);

        if ((res.data.code === 0 || res.data.code === 200) && res.data.data && res.data.data.order) {
          const order = res.data.data.order;
          const payType = this.data.payType;

          // 判断支付是否成功
          let paymentSuccess = false;
          if (payType === 'prepay') {
            // 预付款:检查订单状态是否从 pending_payment 变为 pending
            paymentSuccess = order.status === 'pending' || order.has_paid_prepay;
          } else if (payType === 'repair') {
            // 维修费:检查是否已支付维修费
            paymentSuccess = order.has_paid_repair || order.status === 'in_progress';
          }

          if (paymentSuccess) {
            console.log('[支付页] ✅ 支付状态已确认成功');
            wx.hideLoading();
            this.paymentSuccess();
          } else if (pollCount >= maxPolls) {
            console.warn('[支付页] ⚠️ 达到最大轮询次数,但订单状态未更新');
            wx.hideLoading();
            // 即使状态未更新,也跳转到成功页面,让用户自行刷新
            this.paymentSuccess();
          } else {
            // 继续轮询
            setTimeout(checkStatus, pollInterval);
          }
        } else {
          console.error('[支付页] 订单详情查询失败:', res.data);
          if (pollCount >= maxPolls) {
            wx.hideLoading();
            this.paymentSuccess();
          } else {
            setTimeout(checkStatus, pollInterval);
          }
        }
      },
      fail: (err) => {
        console.error('[支付页] 订单详情查询网络错误:', err);
        if (pollCount >= maxPolls) {
          wx.hideLoading();
          this.paymentSuccess();
        } else {
          setTimeout(checkStatus, pollInterval);
        }
      }
    });
  },

  // 解析或生成 openid（开发环境提供回退）
  resolveOpenId() {
    return new Promise((resolve, reject) => {
      const app = getApp();

      // 1. 优先使用全局缓存
      if (app.globalData.openid) return resolve(app.globalData.openid);

      // 2. 尝试从本地存储读取
      const cached = wx.getStorageSync('openid');
      if (cached) {
        app.globalData.openid = cached;
        return resolve(cached);
      }

      // 3. 开发环境 Mock 逻辑
      const isDev = /localhost|127\.0\.0\.1|:3000/.test(app.globalData.baseUrl || '');
      if (isDev && !app.globalData.useRealOpenId) {
        const mock = `MOCK_OPENID_${Math.floor(Math.random() * 100000)}`;
        wx.setStorageSync('openid', mock);
        app.globalData.openid = mock;
        return resolve(mock);
      }

      // 4. 调用 wx.login + 后端 code2session
      wx.login({
        success: (res) => {
          if (res.code) {
            // 调用后端接口
            wx.request({
              url: `${app.globalData.baseUrl}/auth/code2session`,
              method: 'POST',
              data: { code: res.code },
              success: (apiRes) => {
                console.log('[支付页] code2session 后端响应:', apiRes.data);
                // 兼容后端返回 code 为 0 或 200
                if (apiRes.data.code === 0 || apiRes.data.code === 200 || apiRes.data.success) {
                  const openid = apiRes.data.data.openid;
                  console.log('[支付页] 获取到 OpenID:', openid);
                  // 缓存 OpenID
                  app.globalData.openid = openid;
                  wx.setStorageSync('openid', openid);
                  resolve(openid);
                } else {
                  console.error('[支付页] 获取 OpenID 失败，后端返回:', apiRes.data);
                  reject(new Error(apiRes.data.message || '获取OpenID失败'));
                }
              },
              fail: (err) => {
                reject(new Error('请求后端获取OpenID失败'));
              }
            });
          } else {
            reject(new Error('微信登录失败: ' + res.errMsg));
          }
        },
        fail: (err) => {
          reject(new Error('wx.login 接口调用失败'));
        }
      });
    });
  },

  // 支付成功
  paymentSuccess() {
    wx.redirectTo({
      url: `/pages/payment/result/result?orderId=${this.data.orderId}&status=success`
    });
  }
});