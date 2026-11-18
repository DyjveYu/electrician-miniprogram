const enterpriseSession = require('../../../utils/enterpriseSession');
const orderEntry = require('../../../utils/orderEntry');
const personalOrder = require('../../../utils/personalOrder');
// pages/payment/payment/payment.js
const { PaymentAPI } = require('../../../utils/api');

Page({
  data: {
    showPrepay: false,
    personalPrepay: false,
    unknownResult: false,
    orderLoaded: false,
    loadError: '',
    prepayDisplayAmount: '0.00',
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
    this._requestedType = options.type === 'repair' ? 'repair' : 'prepay';
    this._account = orderEntry.key(getApp());
    this._visible = true;
    const user = getApp().globalData.userInfo;
    if (!this._account || !user?.phone || !['user', 'enterprise'].includes(user.current_role)) {
      wx.reLaunch({ url: '/pages/login/login' });
      return;
    }
    this._choice = personalOrder.consume(getApp(), options.orderId);
    this._prepayAgreed = !!this._choice;
    if (options.type === 'prepay' || options.type === 'repair') this.setData({ payType: options.type });
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
    if (this._unloaded) return;
    const app = getApp();
    enterpriseSession.request({
      url: `${app.globalData.baseUrl}/orders/${this.data.orderId}`,
      method: 'GET',
      header: {
        'Authorization': `Bearer ${app.globalData.token}`
      },
      success: (res) => {
        if (!this.paymentCurrent()) return;
        if (res.data.code === 0 || res.data.code === 200) {
          const order = res.data.data?.order || res.data.data;
          // 根据订单状态判定支付类型
          const typeByStatus = order.status === 'pending_repair_payment' ? 'repair' : 'prepay';
          const payType = order.project_billing && this._requestedType === 'repair' ? 'repair' : typeByStatus;
          const personalPrepay = personalOrder.isExplicit(order) && payType === 'prepay';
          this.setData({ order, payType, personalPrepay, safePayment: personalPrepay || order.service_mode === 'off_site', offsitePayment: order.service_mode === 'off_site', projectPrepay: personalPrepay && order.order_type === 'enterprise_project', orderLoaded: true, loadError: '', payAmount: Number(payType === 'repair' ? order.final_amount : order.prepay_amount), prepayDisplayAmount: Number(order.prepay_amount).toFixed(2) });
          if (personalOrder.isExplicit(order) && this._requestedType === 'prepay' && order.status !== 'pending_payment') {
            this.goToOrder(); return;
          }
          if (personalPrepay) {
            if (order.status !== 'pending_payment') { this.goToOrder(); return; }
            if (this._choice?.mode && (this._choice.mode !== order.pricing_mode || Number(this._choice.amount) !== Number(order.prepay_amount))) this._prepayAgreed = false;
            if (!this._prepayAgreed) { this.setData({ showPrepay: true }); return; }
          }
          this.startPayment();
        } else {
          this.setData({ loadError: res.data.message || '加载订单失败' });
          wx.showToast({ title: res.data.message || '加载订单失败', icon: 'none' });
        }
      },
      fail: () => {
        if (!this.paymentCurrent()) return;
        this.setData({ loadError: '订单加载失败，请重试' });
        wx.showToast({ title: '网络错误', icon: 'none' });
      }
    });
  },

  // 发起微信支付（自动）
  async startPayment() {
    if (this._visible === false) return;
    if (this.data.paying) return;
    if (this.data.unknownResult) return this.pollPaymentStatus();
    if (this._account && !this.data.orderLoaded) return this.loadOrderInfo();
    if (this.data.personalPrepay && !this._prepayAgreed) { this.setData({ showPrepay: true }); return; }
    if (this._account && !this.paymentCurrent()) return;
    this.setData({ paying: true });
    const session = orderEntry.key(getApp());
    const current = () => !this._unloaded && session === orderEntry.key(getApp());

    try {
      const app = getApp();
      const isDev = /localhost|127\.0\.0\.1|:3000/.test(app.globalData.baseUrl || '');
      // 优先使用全局配置；未设置时：开发走测试，生产走微信
      const method = app.globalData.paymentMethod || (isDev ? 'test' : 'wechat');
      const openid = method === 'wechat' ? await this.resolveOpenId() : undefined;
      if (!current()) return;
      if (this._visible === false) { this.setData({ paying: false }); return; }
      const result = await PaymentAPI.createPayment({
        order_id: this.data.orderId,
        payment_method: method,
        type: this.data.payType,
        ...(this.data.offsitePayment && this.data.payType === 'repair' ? { fee_revision: this.data.order.fee_revision } : {}),
        ...(this.data.offsitePayment && this.data.payType === 'prepay' && this._choice?.mode ? { pricing_mode: this._choice.mode, agreed_amount: String(this._choice.amount) } : {}),
        openid,
        ...(this.data.personalPrepay ? { prepay_agreed: this._prepayAgreed === true } : {})
      });

      if (!current()) return;
      if (this._visible === false) { this.setData({ paying: false, unknownResult: true }); return; }
      // 测试确认完成前保持支付锁，防止重复提交。

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
          const confirmed = await PaymentAPI.confirmTestPayment(payload.payment_no);
          if (!current()) return;
          if (![0, 200].includes(confirmed?.code)) throw new Error(confirmed?.message || '测试支付确认失败');
          if (this.data.safePayment) { this.pollPaymentStatus(); return; }
          this.paymentSuccess();
        }
      } else {
        this.setData({ paying: false });
        wx.showToast({ title: (result.message || '支付创建失败'), icon: 'none' });
      }
    } catch (err) {
      if (!current()) return;
      this.setData({ paying: false });
      if (this.data.safePayment) this.setData({ unknownResult: !err.code || err.code >= 500, ...(err.data?.payment_no ? { paymentNo: err.data.payment_no } : {}) });
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
        if (!this.paymentCurrent()) return;
        console.log('[支付页] 微信支付成功回调', res);
        // 支付成功后,主动查询支付状态(作为回调失败的备用方案)
        this.pollPaymentStatus(payParams.package);
      },
      fail: (error) => {
        if (!this.paymentCurrent()) return;
        this.setData({ paying: false });
        if (this.data.safePayment && !String(error?.errMsg || '').includes('cancel')) {
          this.setData({ unknownResult: true });
          wx.showToast({ title: '支付结果未确认，请查询原订单', icon: 'none' });
          return;
        }
        console.error('[支付页] 微信支付失败');
        wx.showToast({ title: '支付失败，请重新发起支付', icon: 'none' });
        if (this.data.safePayment) { this.goToOrder(); return; }
        // 失败后按要求跳转到“我的订单”Tab
        wx.switchTab({ url: '/pages/order/list/list' });
      }
    });
  },

  // 支付结果未知时仅查单，不把超时或查询失败当作成功。
  pollPaymentStatus() {
    if (!this.paymentCurrent() || this._polling) return;
    this._polling = true;
    this.setData({ paying: true, unknownResult: true });
    let attempts = 0;
    const generation = this._pollGeneration = (this._pollGeneration || 0) + 1;
    const check = () => {
      if (!this.paymentCurrent() || generation !== this._pollGeneration) return;
      this.queryOrderStatus(++attempts, 10, 1000, check);
    };
    check();
  },

  queryOrderStatus(pollCount, maxPolls, pollInterval, checkStatus) {
    if (!this.paymentCurrent()) return;
    const app = getApp();
    const finishUnknown = () => {
      this._polling = false;
      this.setData({ paying: false, unknownResult: true });
      wx.hideLoading();
      wx.showToast({ title: '支付结果未确认，请查询原订单', icon: 'none' });
    };
    const again = () => {
      if (!this.paymentCurrent()) return;
      if (pollCount >= maxPolls) finishUnknown();
      else this._pollTimer = setTimeout(checkStatus, pollInterval);
    };
    const readOrder = (payment) => enterpriseSession.request({
      url: `${app.globalData.baseUrl}/orders/${this.data.orderId}`,
      method: 'GET',
      header: { Authorization: `Bearer ${app.globalData.token}` },
      success: (res) => {
        if (!this.paymentCurrent()) return;
        if (![0, 200].includes(res.data?.code)) { again(); return; }
        const order = res.data.data?.order || res.data.data;
        if (!order) { again(); return; }
        if (['cancelled', 'closed', 'cancel_pending'].includes(order.status)) {
          this._polling = false;
          this.setData({ paying: false });
          this.goToOrder();
          return;
        }
        const paid = this.data.payType === 'repair'
          ? !!order.has_paid_repair
          : !!order.has_paid_prepay || !!order.prepaid_at || ['pending', 'accepted', 'in_progress', 'pending_repair_payment', 'pending_review', 'completed_settled', 'completed_unsettle', 'pending_second_review'].includes(order.status);
        if (paid) {
          this._polling = false;
          this.setData({ paying: false, unknownResult: false });
          wx.hideLoading();
          this.paymentSuccess();
        } else if (payment && ['failed', 'expired'].includes(payment.status) && order.status === 'pending_payment') {
          this._polling = false;
          this._prepayAgreed = false;
          this.setData({ paying: false, unknownResult: false });
          wx.showToast({ title: '该次支付未完成，可重新确认付款', icon: 'none' });
        } else again();
      },
      fail: again
    });
    if (this.data.safePayment && this.data.paymentNo) {
      PaymentAPI.queryPayment(this.data.paymentNo).then(result => {
        if (!this.paymentCurrent()) return;
        const payment = result.data?.payment || result.data;
        readOrder(payment);
      }).catch(() => { if (this.paymentCurrent()) readOrder(null); });
    } else readOrder(null);
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
            enterpriseSession.request({
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

  paymentCurrent() { return !this._unloaded && (!this._account || this._account === orderEntry.key(getApp())); },

  confirmPrepay(e) {
    if (!this.paymentCurrent() || !this._visible) return;
    if (this.data.offsitePayment && !this.data.projectPrepay) {
      this._choice = e?.detail;
      if (!this._choice?.mode) return;
      this.setData({ order: { ...this.data.order, pricing_mode: this._choice.mode, prepay_amount: this._choice.amount }, payAmount: Number(this._choice.amount), prepayDisplayAmount: Number(this._choice.amount).toFixed(2) });
    }
    this._prepayAgreed = true;
    this.setData({ showPrepay: false });
    this.startPayment();
  },

  goToOrder() {
    if (!this.paymentCurrent()) return;
    wx.redirectTo({ url: `/pages/order/detail/detail?id=${this.data.orderId}` });
  },

  onShow() { this._visible = true; },
  onHide() { this._visible = false; },
  onUnload() { this._unloaded = true; clearTimeout(this._pollTimer); },

  // 支付成功
  paymentSuccess() {
    if (!this.paymentCurrent()) return;
    if (this.data.offsitePayment) { this.goToOrder(); return; }
    wx.redirectTo({
      url: `/pages/payment/result/result?orderId=${this.data.orderId}&status=success`
    });
  }
});
