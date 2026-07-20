// pages/order-landing-detail/index.js
// 落地页订单详情（独立副本）—— 所有操作后留在本页刷新，不跳转其他页面
const app = getApp();
const MAX_FINAL_AMOUNT = 99999999.99;
const { getOrderStatusText } = require('../../utils/util');

Page({
  data: {
    orderId: '',
    order: null,
    loading: true,
    action: '',
    workContent: '',
    workImages: [],
    finalAmount: '',
    completing: false,
    paying: false,
    currentRole: 'user',
    updateAmount: '',
    updateContent: '',
    updating: false,
    rating: 5,
    reviewComment: '',
    reviewing: false
  },

  onLoad(options) {
    if (options.id) {
      this.setData({
        orderId: options.id,
        action: options.action || ''
      });
      this._firstShowSkipped = false;
      this._fetchingDetail = false;
      this.loadOrderDetail();
    } else {
      wx.showToast({ title: '订单ID不能为空', icon: 'none' });
    }
  },

  onShow() {
    if (app.checkFrozenAndRedirect && app.checkFrozenAndRedirect()) return;
    if (!this._firstShowSkipped) {
      this._firstShowSkipped = true;
      return;
    }
    if (this.data.orderId) {
      this.loadOrderDetail();
    }
  },

  onPullDownRefresh() {
    this.loadOrderDetail();
  },

  // ── 刷新按钮 ──
  refreshOrder() {
    wx.showToast({ title: '刷新中...', icon: 'loading', duration: 800 });
    this.loadOrderDetail();
  },

  // ── 加载订单详情 ──
  loadOrderDetail() {
    if (this._fetchingDetail) return;
    this._fetchingDetail = true;

    wx.request({
      url: `${app.globalData.baseUrl}/orders/${this.data.orderId}`,
      method: 'GET',
      header: { 'Authorization': `Bearer ${app.globalData.token}` },
      success: (res) => {
        wx.stopPullDownRefresh();
        this.setData({ loading: false });
        this._fetchingDetail = false;

        const code = res?.data?.code;
        const ok = code === 0 || code === 200 || res.statusCode === 200 || res?.data?.success === true;
        if (ok) {
          const raw = res?.data?.data?.order || res?.data?.data || {};
          const normalizedStatus = raw.status === 'confirmed' ? 'in_progress' : raw.status;
          const prepayAmount = raw.prepay_amount ||
            (raw.serviceType && raw.serviceType.prepay_amount) ||
            raw.estimated_amount ||
            raw.amount || 30;
          const repairAmount = raw.final_amount ?? raw.repair_amount ?? raw.amount ?? raw.estimated_amount ?? '';
          const prefillUpdateAmount = repairAmount;
          const rawElectrician = raw.electrician || {};
          const certRealName = rawElectrician.certification && rawElectrician.certification.real_name;
          const normalizedElectrician = rawElectrician && typeof rawElectrician === 'object'
            ? {
              ...rawElectrician,
              name: (certRealName && certRealName.length >= 1) ? certRealName.slice(0, 1) + '工' : (rawElectrician.nickname || rawElectrician.nickName || '')
            }
            : null;
          const normalizedReview = raw.review && typeof raw.review === 'object'
            ? { rating: raw.review.rating, content: raw.review.content || '' }
            : null;
          const normalizeImageUrl = (url) => {
            if (!url) return '';
            if (/^https?:\/\//.test(url)) return url;
            if (url.startsWith('/')) return app.globalData.imageBaseUrl + url;
            const m = url.match(/\/uploads\/.+$/);
            return app.globalData.imageBaseUrl + (m ? m[0] : '/' + url);
          };

          const order = {
            ...raw,
            review: normalizedReview,
            electrician: normalizedElectrician,
            orderNumber: raw.orderNumber || raw.order_no,
            createTime: this.formatOrderTime(raw.createTime || raw.created_at),
            serviceTypeName: raw.serviceTypeName || (raw.serviceType && raw.serviceType.name) || '',
            contactName: raw.contactName || raw.contact_name,
            contactPhone: raw.contactPhone || raw.contact_phone,
            contactPhoneMasked: this.maskPhone(raw.contactPhone || raw.contact_phone),
            address: raw.address || raw.service_address,
            images: Array.isArray(raw.images) ? raw.images.map(normalizeImageUrl) : [],
            workContent: raw.workContent || raw.repair_content || '',
            workImages: Array.isArray(raw.workImages) ? raw.workImages.map(normalizeImageUrl) : (Array.isArray(raw.repair_images) ? raw.repair_images.map(normalizeImageUrl) : []),
            amount: prepayAmount,
            repairAmount,
            prefillUpdateAmount,
            electricityTypeName: raw.electricityTypeName || (raw.electricity_type === 'industrial' ? '工业用电' : raw.electricity_type === 'residential' ? '居民用电' : ''),
            projStartTimeShort: raw.projStartTime ? this.formatShortTime(raw.projStartTime) : '',
            projEndTimeShort: raw.projEndTime ? this.formatShortTime(raw.projEndTime) : '',
            projActualAmount: raw.projTotalAmount ? (Number(raw.projTotalAmount) * 0.85).toFixed(2) : null,
            orderTypeText: this.getOrderTypeText(raw.order_type || raw.orderType)
          };

          const prepayNum = Number(order.amount) || 0;
          const repairNum = Number(order.repairAmount) || 0;
          const showInstallTotal = ['in_progress', 'pending_review', 'completed_settled'].includes(normalizedStatus);
          const installFee = showInstallTotal ? (prepayNum + repairNum).toFixed(2) : null;

          const appRole = app.globalData.currentRole || 'user';
          const flags = this.computeActionFlags({ ...order, status: normalizedStatus }, appRole);
          this.setData({
            currentRole: appRole,
            order: {
              ...order,
              status: normalizedStatus,
              statusText: getOrderStatusText(normalizedStatus),
              installFee,
              ...flags
            }
          });

          if (flags.canSubmitCompletedUpdate) {
            this.setData({
              updateAmount: order.prefillUpdateAmount ? String(order.prefillUpdateAmount) : '',
              updateContent: order.workContent || ''
            });
          } else {
            this.setData({ updateAmount: '', updateContent: '' });
          }
          if (flags.canReview) {
            this.setData({ rating: 5, reviewComment: '' });
          }
          if (this.data.action === 'completed_settled') {
            this.setData({
              workContent: order.workContent || '',
              finalAmount: order.amount ? String(order.amount) : ''
            });
          }
        } else {
          wx.showToast({ title: res.data?.message || '加载失败', icon: 'none' });
        }
      },
      fail: () => {
        wx.stopPullDownRefresh();
        this.setData({ loading: false });
        this._fetchingDetail = false;
        wx.showToast({ title: '网络错误，请重试', icon: 'none' });
      }
    });
  },

  computeActionFlags(order, role) {
    const st = order.status;
    const canCancel = st === 'pending' || st === 'pending_payment';
    const canAccept = role === 'electrician' && (st === 'pending' || st === 'recruiting') && !order.hasJoined;
    const canWithdraw = role === 'electrician' && (st === 'recruiting' || st === 'full') && order.hasJoined;
    const canComplete = role === 'electrician' && st === 'in_progress';
    const isPayer = role === 'user' || role === 'enterprise';
    const canPay = isPayer && (st === 'pending_payment' || st === 'pending_repair_payment');
    const canReview = isPayer && (st === 'pending_review' || st === 'pending_second_review') && order.order_type !== 'enterprise_project';
    const canSubmitCompletedUpdate = role === 'electrician' && (st === 'accepted' || st === 'pending_repair_payment');
    const canPayRepairFee = isPayer && st === 'pending_repair_payment';
    const canReviewProject = role === 'enterprise' && order.order_type === 'enterprise_project' && (st === 'reviewing' || st === 'pending_second_review');
    const canReviewEnterprise = role === 'electrician'
      && order.order_type === 'enterprise_project'
      && order.hasJoined
      && !order.electricianReviewed
      && ['reviewing', 'pending_second_review', 'completed_settled', 'completed_unsettle'].includes(st);
    return { canCancel, canAccept, canWithdraw, canComplete, canPay, canReview, canSubmitCompletedUpdate, canPayRepairFee, canReviewProject, canReviewEnterprise };
  },

  previewImage(e) {
    const current = e.currentTarget.dataset.src;
    const urls = e.currentTarget.dataset.urls;
    wx.previewImage({ current, urls });
  },

  makePhoneCall(e) {
    const phone = e.currentTarget.dataset.phone;
    wx.makePhoneCall({ phoneNumber: phone });
  },

  // ── 取消订单 ──
  cancelOrder() {
    const order = this.data.order;
    const isPaid = order.status === 'pending';
    let content = '确定要取消这个订单吗？';
    if (isPaid) content = '取消订单后将原路退回预付款，是否继续？';
    wx.showModal({
      title: '确认取消',
      content,
      success: (res) => {
        if (res.confirm) this.performCancelOrder();
      }
    });
  },

  performCancelOrder() {
    const order = this.data.order;
    const isPaid = order.status === 'pending';
    const cancelReason = isPaid ? '用户取消已支付订单' : '用户取消未支付订单';

    wx.request({
      url: `${app.globalData.baseUrl}/orders/${this.data.orderId}/cancel`,
      method: 'PUT',
      header: { 'Authorization': `Bearer ${app.globalData.token}` },
      data: { cancel_reason: cancelReason },
      success: (res) => {
        const code = res?.data?.code;
        const ok = code === 0 || code === 200 || res.statusCode === 200 || res?.data?.success === true;
        if (ok) {
          wx.showToast({ title: isPaid ? '订单已取消，退款将原路返回' : '订单已取消', icon: 'success' });
          // 留在本页刷新
          setTimeout(() => this.loadOrderDetail(), 1000);
        } else {
          wx.showToast({ title: res.data?.message || '取消失败', icon: 'none' });
        }
      },
      fail: () => { wx.showToast({ title: '网络错误', icon: 'none' }); }
    });
  },

  // ── 接单 ──
  acceptOrder() {
    if (app.globalData.userInfo && app.globalData.userInfo.status === 'banned') {
      wx.showToast({ title: '您的账号已被冻结，无法接单', icon: 'none' });
      return;
    }
    const hour = new Date().getHours();
    if (hour >= 22 || hour < 5) {
      wx.showModal({
        title: '安全提示',
        content: '涉及夜间工作，如遇到危险，请随时报警处理。',
        showCancel: false,
        confirmText: '我已知晓'
      });
    }
    wx.showModal({
      title: '确认接单',
      content: '确认接下此订单？',
      confirmText: '接单',
      success: (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '接单中...' });
        wx.request({
          url: `${app.globalData.baseUrl}/orders/${this.data.orderId}/take`,
          method: 'POST',
          header: { 'Authorization': `Bearer ${app.globalData.token}` },
          success: (res) => {
            wx.hideLoading();
            const code = res?.data?.code;
            const ok = code === 0 || code === 200 || res.statusCode === 200 || res?.data?.success === true;
            if (ok) {
              wx.showToast({ title: '接单成功', icon: 'success' });
              // 留在本页刷新
              setTimeout(() => this.loadOrderDetail(), 1000);
            } else {
              wx.showToast({ title: res?.data?.message || '接单失败', icon: 'none' });
            }
          },
          fail: () => { wx.hideLoading(); wx.showToast({ title: '网络错误', icon: 'none' }); }
        });
      }
    });
  },

  // ── 退单 ──
  withdrawOrder() {
    wx.showModal({
      title: '确认退单',
      content: '确认退出此多日工程订单？',
      confirmText: '退单',
      success: (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '退单中...' });
        wx.request({
          url: `${app.globalData.baseUrl}/orders/${this.data.orderId}/withdraw`,
          method: 'POST',
          header: { 'Authorization': `Bearer ${app.globalData.token}` },
          success: (res) => {
            wx.hideLoading();
            const code = res?.data?.code;
            const ok = code === 0 || code === 200 || res.statusCode === 200 || res?.data?.success === true;
            if (ok) {
              wx.showToast({ title: '退单成功', icon: 'success' });
              // 留在本页刷新
              setTimeout(() => this.loadOrderDetail(), 1000);
            } else {
              wx.showToast({ title: res?.data?.message || '退单失败', icon: 'none' });
            }
          },
          fail: () => { wx.hideLoading(); wx.showToast({ title: '网络错误', icon: 'none' }); }
        });
      }
    });
  },

  // ── 完成订单 ──
  completeOrder() {
    if (!this.validateCompleteForm()) return;
    if (this.data.completing) return;
    this.setData({ completing: true });

    wx.request({
      url: `${app.globalData.baseUrl}/orders/${this.data.orderId}/complete`,
      method: 'POST',
      header: { 'Authorization': `Bearer ${app.globalData.token}` },
      data: {
        workContent: this.data.workContent,
        workImages: this.data.workImages,
        finalAmount: parseFloat(this.data.finalAmount)
      },
      success: (res) => {
        this.setData({ completing: false });
        if (res.data.code === 0 || res.data.code === 200) {
          wx.showToast({ title: '订单已完成', icon: 'success' });
          // 留在本页刷新
          setTimeout(() => this.loadOrderDetail(), 1000);
        } else {
          wx.showToast({ title: res.data.message || '完成失败', icon: 'none' });
        }
      },
      fail: () => {
        this.setData({ completing: false });
        wx.showToast({ title: '网络错误', icon: 'none' });
      }
    });
  },

  // ── 提交维修信息 ──
  submitUpdate() {
    if (this.data.updating) return;
    if (!this.validateUpdateForm()) return;
    this.setData({ updating: true });

    const content = this.data.updateContent.trim();
    wx.request({
      url: `${app.globalData.baseUrl}/orders/${this.data.orderId}/update`,
      method: 'PUT',
      header: { 'Authorization': `Bearer ${app.globalData.token}` },
      data: {
        amount: parseFloat(this.data.updateAmount),
        remark: content,
        repair_content: content
      },
      success: (res) => {
        this.setData({ updating: false });
        const ok = res?.data?.code === 0 || res?.data?.success === true || res.statusCode === 200;
        if (ok) {
          wx.showToast({ title: '提交成功', icon: 'success' });
          // 留在本页刷新
          setTimeout(() => this.loadOrderDetail(), 1000);
        } else {
          wx.showToast({ title: res.data?.message || '提交失败', icon: 'none' });
        }
      },
      fail: () => {
        this.setData({ updating: false });
        wx.showToast({ title: '网络错误', icon: 'none' });
      }
    });
  },

  // ── 表单输入 ──
  onWorkContentInput(e) { this.setData({ workContent: e.detail.value }); },
  onFinalAmountInput(e) { this.setData({ finalAmount: e.detail.value }); },
  onUpdateAmountInput(e) { this.setData({ updateAmount: e.detail.value }); },
  onUpdateContentInput(e) { this.setData({ updateContent: e.detail.value }); },
  onReviewCommentInput(e) { this.setData({ reviewComment: e.detail.value }); },

  setRating(e) {
    const value = Number(e.currentTarget.dataset.value) || 1;
    this.setData({ rating: value });
  },

  chooseWorkImage() {
    wx.chooseImage({
      count: 3 - this.data.workImages.length,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        this.setData({ workImages: this.data.workImages.concat(res.tempFilePaths) });
      }
    });
  },

  deleteWorkImage(e) {
    const index = e.currentTarget.dataset.index;
    const workImages = this.data.workImages;
    workImages.splice(index, 1);
    this.setData({ workImages });
  },

  // ── 提交评价 ──
  async submitReview() {
    if (this.data.reviewing) return;
    if (!this.data.rating || this.data.rating < 1 || this.data.rating > 5) {
      wx.showToast({ title: '请选择评分', icon: 'none' });
      return;
    }
    this.setData({ reviewing: true });
    wx.request({
      url: `${app.globalData.baseUrl}/orders/${this.data.orderId}/review`,
      method: 'PUT',
      header: { 'Authorization': `Bearer ${app.globalData.token}` },
      data: { rating: this.data.rating, comment: this.data.reviewComment },
      success: (res) => {
        this.setData({ reviewing: false });
        const ok = res?.data?.code === 0 || res?.data?.success === true || res.statusCode === 200;
        if (ok) {
          wx.showToast({ title: '评价成功', icon: 'success' });
          // 留在本页刷新
          this.loadOrderDetail();
          this._checkReferrerQualification();
        } else {
          wx.showToast({ title: res?.data?.message || '提交失败', icon: 'none' });
        }
      },
      fail: () => {
        this.setData({ reviewing: false });
        wx.showToast({ title: '网络错误', icon: 'none' });
      }
    });
  },

  validateCompleteForm() {
    const amountValue = parseFloat(this.data.finalAmount) || parseFloat(this.data.order?.final_amount) || parseFloat(this.data.order?.repairAmount);
    if (!amountValue || amountValue <= 0) {
      wx.showToast({ title: '请输入正确的金额', icon: 'none' });
      return false;
    }
    if (amountValue > MAX_FINAL_AMOUNT) {
      wx.showToast({ title: `金额不能超过${MAX_FINAL_AMOUNT}`, icon: 'none' });
      return false;
    }
    return true;
  },

  validateUpdateForm() {
    if (!this.data.updateContent.trim()) {
      wx.showToast({ title: '请输入维修内容', icon: 'none' });
      return false;
    }
    const amountValue = parseFloat(this.data.updateAmount);
    if (!this.data.updateAmount || amountValue <= 0) {
      wx.showToast({ title: '请输入正确的金额', icon: 'none' });
      return false;
    }
    if (amountValue > MAX_FINAL_AMOUNT) {
      wx.showToast({ title: `金额不能超过${MAX_FINAL_AMOUNT}`, icon: 'none' });
      return false;
    }
    return true;
  },

  // ── 支付 ──
  goToPay() { return this.handlePayment('prepay'); },
  goToRepairPay() { return this.handlePayment('repair'); },

  async handlePayment(type) {
    if (this.data.paying) return;
    this.setData({ paying: true });

    try {
      const isDev = /localhost|127\.0\.0\.1|:3000/.test(app.globalData.baseUrl || '');
      const method = app.globalData.paymentMethod || (isDev ? 'test' : 'wechat');

      const openid = method === 'wechat' ? await this.resolveOpenId() : undefined;

      const { PaymentAPI } = require('../../utils/api');
      const result = await PaymentAPI.createPayment({
        order_id: this.data.orderId,
        payment_method: method,
        type,
        openid
      });

      this.setData({ paying: false });

      const payload = result.data || result;
      if (payload && (payload.success || payload.pay_params)) {
        const payParams = payload.pay_params || payload;
        if (method === 'wechat') {
          this.processPayment(payParams);
        } else {
          this.processTestPayment(payload.payment_no);
        }
      } else {
        wx.showToast({ title: result.message || '支付创建失败', icon: 'none' });
      }
    } catch (err) {
      this.setData({ paying: false });
      wx.showToast({ title: err.message || '支付异常', icon: 'none' });
    }
  },

  processPayment(payParams) {
    wx.requestPayment({
      timeStamp: String(payParams.timeStamp),
      nonceStr: payParams.nonceStr,
      package: payParams.package,
      signType: payParams.signType || 'RSA',
      paySign: payParams.paySign,
      success: () => { this.paymentSuccess(); },
      fail: () => {
        wx.showToast({ title: '支付失败，请重新发起支付', icon: 'none' });
        this.loadOrderDetail();
      }
    });
  },

  async processTestPayment(payment_no) {
    try {
      const { PaymentAPI } = require('../../utils/api');
      const confirmResult = await PaymentAPI.confirmTestPayment(payment_no);
      if (confirmResult.data && confirmResult.data.success) {
        wx.showToast({ title: '支付成功', icon: 'success' });
        setTimeout(() => { this.paymentSuccess(); }, 1000);
      } else {
        wx.showToast({ title: confirmResult.message || '支付确认失败', icon: 'none' });
      }
    } catch (err) {
      wx.showToast({ title: err.message || '支付确认异常', icon: 'none' });
    }
  },

  // ── 支付成功后留在本页刷新 ──
  paymentSuccess() {
    wx.showToast({ title: '支付成功', icon: 'success' });
    // 不跳转到支付结果页，留在本页刷新订单状态
    setTimeout(() => this.loadOrderDetail(), 500);
  },

  resolveOpenId() {
    return new Promise((resolve, reject) => {
      if (app.globalData.openid) return resolve(app.globalData.openid);

      const cached = wx.getStorageSync('openid');
      if (cached) {
        app.globalData.openid = cached;
        return resolve(cached);
      }

      const isDev = /localhost|127\.0\.0\.1|:3000/.test(app.globalData.baseUrl || '');
      if (isDev && !app.globalData.useRealOpenId) {
        const mock = `MOCK_OPENID_${Math.floor(Math.random() * 100000)}`;
        wx.setStorageSync('openid', mock);
        app.globalData.openid = mock;
        return resolve(mock);
      }

      wx.login({
        success: (res) => {
          if (res.code) {
            wx.request({
              url: `${app.globalData.baseUrl}/auth/code2session`,
              method: 'POST',
              data: { code: res.code },
              success: (apiRes) => {
                if (apiRes.data.code === 0 || apiRes.data.code === 200 || apiRes.data.success) {
                  const openid = apiRes.data.data.openid;
                  app.globalData.openid = openid;
                  wx.setStorageSync('openid', openid);
                  resolve(openid);
                } else {
                  reject(new Error(apiRes.data.message || '获取OpenID失败'));
                }
              },
              fail: () => reject(new Error('请求后端获取OpenID失败'))
            });
          } else {
            reject(new Error('微信登录失败'));
          }
        },
        fail: () => reject(new Error('wx.login 调用失败'))
      });
    });
  },

  // ── 工具方法 ──
  formatOrderTime(time) {
    if (!time) return '';
    const date = new Date(time);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
  },

  formatShortTime(time) {
    if (!time) return '';
    const date = new Date(time);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  },

  getOrderTypeText(orderType) {
    const map = {
      enterprise_project: '企业多日工程',
      enterprise_quick: '企业快修订单',
      personal_quick: '个人快修订单'
    };
    return map[orderType] || orderType || '';
  },

  maskPhone(phone) {
    if (!phone || typeof phone !== 'string') return '';
    if (phone.length >= 11) return phone.slice(0, 3) + '****' + phone.slice(-4);
    return phone;
  },

  _checkReferrerQualification() { /* keep for compatibility */ }
});
