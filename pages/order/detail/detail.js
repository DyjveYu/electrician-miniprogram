// pages/order/detail/detail.js
const MAX_FINAL_AMOUNT = 99999999.99; // 数据库 decimal(10,2) 最大支持 8 位整数 + 2 小数
const { getOrderStatusText } = require('../../../utils/util');
Page({
  data: {
    orderId: '',
    order: null,
    loading: true,
    action: '', // complete, pay等操作
    // 完成订单相关
    workContent: '',
    workImages: [],
    finalAmount: '',
    completing: false,
    // 支付相关
    paying: false,
    currentRole: 'user',
    // 已接单，电工修改
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
      // 初始化防重复请求标记
      this._firstShowSkipped = false;
      this._fetchingDetail = false;
      this.loadOrderDetail();
    } else {
      wx.showToast({ title: '订单ID不能为空', icon: 'none' });
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
    }
  },

  onShow() {
    // 页面显示时刷新数据；避免与onLoad的首次显示重复触发
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

  // 加载订单详情
  loadOrderDetail() {
    // 避免并发重复请求触发后端限流
    if (this._fetchingDetail) return;
    this._fetchingDetail = true;
    const app = getApp();

    wx.request({
      url: `${app.globalData.baseUrl}/orders/${this.data.orderId}`,
      method: 'GET',
      header: {
        'Authorization': `Bearer ${app.globalData.token}`
      },
      success: (res) => {
        wx.stopPullDownRefresh();
        this.setData({ loading: false });
        this._fetchingDetail = false;

        const code = res?.data?.code;
        const ok = code === 0 || code === 200 || res.statusCode === 200 || res?.data?.success === true;
        if (ok) {
          // 兼容后端返回结构：{ data: { order: {...} } }
          const raw = res?.data?.data?.order || res?.data?.data || {};
          const normalizedStatus = raw.status === 'confirmed' ? 'in_progress' : raw.status;
          const prepayAmount = (raw.serviceType && raw.serviceType.prepay_amount) ||
            raw.prepay_amount ||
            raw.estimated_amount ||
            raw.amount ||
            30;
          const repairAmount = raw.final_amount ?? raw.repair_amount ?? raw.amount ?? raw.estimated_amount ?? '';
          const prefillUpdateAmount = repairAmount;
          const rawElectrician = raw.electrician || {};
          const normalizedElectrician = rawElectrician && typeof rawElectrician === 'object'
            ? {
              ...rawElectrician,
              name: rawElectrician.name || rawElectrician.nickname || rawElectrician.nickName || ''
            }
            : null;
          const normalizedReview = raw.review && typeof raw.review === 'object'
            ? {
              rating: raw.review.rating,
              content: raw.review.content || ''
            }
            : null;
          const order = {
            ...raw,
            review: normalizedReview,
            electrician: normalizedElectrician,
            // 字段名映射，兼容后端字段
            orderNumber: raw.orderNumber || raw.order_no,
            createTime: raw.createTime || raw.created_at,
            serviceTypeName: raw.serviceTypeName || (raw.serviceType && raw.serviceType.name) || '',
            contactName: raw.contactName || raw.contact_name,
            contactPhone: raw.contactPhone || raw.contact_phone,
            address: raw.address || raw.service_address,
            images: Array.isArray(raw.images) ? raw.images : [],
            workContent: raw.workContent || raw.repair_content || '',
            workImages: Array.isArray(raw.workImages) ? raw.workImages : (Array.isArray(raw.repair_images) ? raw.repair_images : []),
            // 优先从 serviceType 获取预付款金额，其次从订单字段
            amount: prepayAmount,
            repairAmount,
            prefillUpdateAmount
          };

          // 计算“维修安装费”合计（仅在进行中/待评价/已完成展示）
          const prepayNum = Number(order.amount) || 0;
          const repairNum = Number(order.repairAmount) || 0;
          const showInstallTotal = ['in_progress', 'pending_review', 'completed'].includes(normalizedStatus);
          const installFee = showInstallTotal ? (prepayNum + repairNum).toFixed(2) : null;

          // 计算底部操作权限标记，避免按钮不显示
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
            this.setData({
              updateAmount: '',
              updateContent: ''
            });
          }
          if (flags.canReview) {
            this.setData({
              rating: 5,
              reviewComment: ''
            });
          }

          // 如果是完成订单操作，初始化表单数据（使用后端字段）
          if (this.data.action === 'complete') {
            this.setData({
              workContent: order.workContent || '',
              finalAmount: order.amount ? String(order.amount) : ''
            });
          }
        } else {
          wx.showToast({ title: res.data.message || '加载失败', icon: 'none' });
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

  // 基于订单状态与当前角色计算底部操作权限
  computeActionFlags(order, role) {
    const st = order.status;
    const hasReview = !!(order.has_review || order.reviewed_at);
    // 基础权限
    const canCancel = st === 'pending' || st === 'pending_payment';
    const canAccept = role === 'electrician' && st === 'pending';
    const canComplete = role === 'electrician' && st === 'in_progress';
    const canConfirmAmount = role === 'user' && (st === 'pending_payment' || st === 'pending_repair_payment');
    const canPay = role === 'user' && (st === 'pending_payment' || st === 'pending_repair_payment');
    const canReview = role === 'user' && st === 'pending_review';
    const canSubmitCompletedUpdate = role === 'electrician' && (st === 'accepted' || st === 'pending_repair_payment');
    const canPayRepairFee = role === 'user' && st === 'pending_repair_payment';
    return { canCancel, canAccept, canComplete, canConfirmAmount, canPay, canReview, canSubmitCompletedUpdate, canPayRepairFee };
  },

  // 预览图片
  previewImage(e) {
    const current = e.currentTarget.dataset.src;
    const urls = e.currentTarget.dataset.urls;
    wx.previewImage({
      current,
      urls
    });
  },

  // 联系对方
  makePhoneCall(e) {
    const phone = e.currentTarget.dataset.phone;
    wx.makePhoneCall({
      phoneNumber: phone
    });
  },

  // 取消订单
  cancelOrder() {
    const that = this;
    wx.showModal({
      title: '确认取消',
      content: '确定要取消这个订单吗？',
      success(res) {
        if (res.confirm) {
          that.performCancelOrder();
        }
      }
    });
  },

  // 执行取消订单
  performCancelOrder() {
    const app = getApp();

    wx.request({
      url: `${app.globalData.baseUrl}/orders/${this.data.orderId}/cancel`,
      method: 'PUT',
      header: {
        'Authorization': `Bearer ${app.globalData.token}`
      },
      data: {
        cancel_reason: '用户取消预付款'
      },
      success: (res) => {
        const code = res?.data?.code;
        const ok = code === 0 || code === 200 || res.statusCode === 200 || res?.data?.success === true;
        if (ok) {
          wx.showToast({ title: '订单已取消', icon: 'success' });
          setTimeout(() => {
            wx.switchTab({ url: '/pages/order/list/list' });
          }, 1500);
        } else {
          wx.showToast({ title: res.data.message || '取消失败', icon: 'none' });
        }
      },
      fail: () => {
        wx.showToast({ title: '网络错误，请重试', icon: 'none' });
      }
    });
  },

  // 接单（电工）
  acceptOrder() {
    const app = getApp();

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
          header: {
            'Authorization': `Bearer ${app.globalData.token}`
          },
          success: (res) => {
            wx.hideLoading();
            const code = res?.data?.code;
            const success = code === 0 || code === 200 || res.statusCode === 200 || res?.data?.success === true;
            if (success) {
              wx.showToast({
                title: '接单成功',
                icon: 'success',
                duration: 1500
              });
              setTimeout(() => {
                wx.switchTab({
                  url: '/pages/order/list/list'
                });
              }, 1500);
            } else {
              wx.showToast({ title: res?.data?.message || '接单失败', icon: 'none' });
            }
          },
          fail: () => {
            wx.hideLoading();
            wx.showToast({ title: '网络错误，请重试', icon: 'none' });
          }
        });
      }
    });
  },

  // 输入维修内容
  onWorkContentInput(e) {
    this.setData({
      workContent: e.detail.value
    });
  },

  // 输入最终金额
  onFinalAmountInput(e) {
    this.setData({
      finalAmount: e.detail.value
    });
  },

  onUpdateAmountInput(e) {
    this.setData({
      updateAmount: e.detail.value
    });
  },

  onUpdateContentInput(e) {
    this.setData({
      updateContent: e.detail.value
    });
  },

  onReviewCommentInput(e) {
    this.setData({
      reviewComment: e.detail.value
    });
  },

  setRating(e) {
    const value = Number(e.currentTarget.dataset.value) || 1;
    this.setData({
      rating: value
    });
  },

  // 选择维修图片
  chooseWorkImage() {
    const that = this;
    wx.chooseImage({
      count: 3 - this.data.workImages.length,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success(res) {
        const tempFilePaths = res.tempFilePaths;
        that.setData({
          workImages: that.data.workImages.concat(tempFilePaths)
        });
      }
    });
  },

  // 删除维修图片
  deleteWorkImage(e) {
    const index = e.currentTarget.dataset.index;
    const workImages = this.data.workImages;
    workImages.splice(index, 1);
    this.setData({ workImages });
  },

  // 完成订单
  completeOrder() {
    if (!this.validateCompleteForm()) return;

    if (this.data.completing) return;

    this.setData({ completing: true });

    const app = getApp();
    const completeData = {
      workContent: this.data.workContent,
      workImages: this.data.workImages,
      finalAmount: parseFloat(this.data.finalAmount)
    };

    wx.request({
      url: `${app.globalData.baseUrl}/orders/${this.data.orderId}/complete`,
      method: 'POST',
      header: {
        'Authorization': `Bearer ${app.globalData.token}`
      },
      data: completeData,
      success: (res) => {
        this.setData({ completing: false });
        if (res.data.code === 0 || res.data.code === 200) {
          wx.showToast({ title: '订单已完成', icon: 'success' });
          setTimeout(() => {
            wx.navigateBack();
          }, 1500);
        } else {
          wx.showToast({ title: res.data.message || '完成失败', icon: 'none' });
        }
      },
      fail: () => {
        this.setData({ completing: false });
        wx.showToast({ title: '网络错误，请重试', icon: 'none' });
      }
    });
  },

  submitUpdate() {
    if (this.data.updating) return;

    if (!this.validateUpdateForm()) return;

    this.setData({ updating: true });

    const app = getApp();
    const content = this.data.updateContent.trim();
    const payload = {
      amount: parseFloat(this.data.updateAmount),
      remark: content,
      repair_content: content
    };

    wx.request({
      url: `${app.globalData.baseUrl}/orders/${this.data.orderId}/update`,
      method: 'PUT',
      header: {
        'Authorization': `Bearer ${app.globalData.token}`
      },
      data: payload,
      success: (res) => {
        this.setData({ updating: false });
        const ok = res?.data?.code === 0 || res?.data?.success === true || res.statusCode === 200;
        if (ok) {
          wx.showToast({ title: '提交成功', icon: 'success', duration: 1500 });
          setTimeout(() => {
            wx.switchTab({
              url: '/pages/order/list/list'
            });
          }, 1500);
        } else {
          wx.showToast({ title: res.data?.message || '提交失败', icon: 'none' });
        }
      },
      fail: () => {
        this.setData({ updating: false });
        wx.showToast({ title: '网络错误，请重试', icon: 'none' });
      }
    });
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

  async submitReview() {
    if (this.data.reviewing) return;
    if (!this.data.rating || this.data.rating < 1 || this.data.rating > 5) {
      wx.showToast({ title: '请选择评分', icon: 'none' });
      return;
    }

    this.setData({ reviewing: true });
    const app = getApp();
    wx.request({
      url: `${app.globalData.baseUrl}/orders/${this.data.orderId}/review`,
      method: 'PUT',
      header: {
        'Authorization': `Bearer ${app.globalData.token}`
      },
      data: {
        rating: this.data.rating,
        comment: this.data.reviewComment
      },
      success: (res) => {
        this.setData({ reviewing: false });
        const ok = res?.data?.code === 0 || res?.data?.success === true || res.statusCode === 200;
        if (ok) {
          wx.showToast({ title: '评价成功', icon: 'success' });
          this.loadOrderDetail();
        } else {
          wx.showToast({ title: res?.data?.message || '提交失败', icon: 'none' });
        }
      },
      fail: () => {
        this.setData({ reviewing: false });
        wx.showToast({ title: '网络错误，请重试', icon: 'none' });
      }
    });
  },

  // 验证完成订单表单
  validateCompleteForm() {
    // 电工视角：允许使用后台已经保存的维修内容/金额，不强制再次填写
    const hasContent = this.data.workContent.trim() || (this.data.order && this.data.order.workContent);
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

  // 去支付 - 直接调用微信支付
  async goToPay() {
    return this.handlePayment('prepay');
  },

  async goToRepairPay() {
    return this.handlePayment('repair');
  },

  async handlePayment(type) {
    if (this.data.paying) return;
    this.setData({ paying: true });

    try {
      const app = getApp();
      const isDev = /localhost|127\.0\.0\.1|:3000/.test(app.globalData.baseUrl || '');
      const method = app.globalData.paymentMethod || (isDev ? 'test' : 'wechat');
      
      console.log('[详情页-支付] 开始支付流程');
      console.log('[详情页-支付] isDev:', isDev);
      console.log('[详情页-支付] baseUrl:', app.globalData.baseUrl);
      console.log('[详情页-支付] paymentMethod 配置:', app.globalData.paymentMethod);
      console.log('[详情页-支付] 最终使用的 method:', method);
      console.log('[详情页-支付] 支付类型 type:', type);
      
      const openid = method === 'wechat' ? await this.resolveOpenId() : undefined;
      console.log('[详情页-支付] OpenID:', openid);

      const { PaymentAPI } = require('../../../utils/api');
      const result = await PaymentAPI.createPayment({
        order_id: this.data.orderId,
        payment_method: method,
        type,
        openid
      });

      console.log('[详情页-支付] 后端返回结果:', result);

      this.setData({ paying: false });

      const payload = result.data || result;
      console.log('[详情页-支付] 解析后的 payload:', payload);
      
      if (payload && (payload.success || payload.pay_params)) {
        const payParams = payload.pay_params || payload;
        console.log('[详情页-支付] 支付参数:', payParams);
        console.log('[详情页-支付] 判断：method =', method);
        
        if (method === 'wechat') {
          console.log('[详情页-支付] 调用 processPayment 拉起微信支付');
          this.processPayment(payParams);
        } else {
          console.log('[详情页-支付] 测试支付，直接标记成功');
          this.processTestPayment(payload.payment_no);
          this.paymentSuccess();
        }
      } else {
        console.error('[详情页-支付] 支付创建失败:', result);
        wx.showToast({
          title: result.message || '支付创建失败',
          icon: 'none'
        });
      }
    } catch (err) {
      console.error('[详情页-支付] 支付异常:', err);
      this.setData({ paying: false });
      wx.showToast({
        title: err.message || '支付异常',
        icon: 'none'
      });
    }
  },

  // 拉起微信支付
  processPayment(payParams) {
    console.log('[详情页-支付] processPayment 被调用');
    console.log('[详情页-支付] 支付参数详情:', payParams);
    console.log('[详情页-支付] timeStamp:', payParams.timeStamp);
    console.log('[详情页-支付] nonceStr:', payParams.nonceStr);
    console.log('[详情页-支付] package:', payParams.package);
    console.log('[详情页-支付] signType:', payParams.signType);
    console.log('[详情页-支付] paySign:', payParams.paySign);
    
    wx.requestPayment({
      timeStamp: String(payParams.timeStamp),
      nonceStr: payParams.nonceStr,
      package: payParams.package,
      signType: payParams.signType || 'RSA',
      paySign: payParams.paySign,
      success: () => {
        console.log('[详情页-支付] wx.requestPayment 成功');
        this.paymentSuccess();
      },
      fail: (err) => {
        console.error('[详情页-支付] wx.requestPayment 失败:', err);
        wx.showToast({
          title: '支付失败，请重新发起支付',
          icon: 'none'
        });
        // 刷新当前页面订单状态
        this.loadOrderDetail();
      }
    });
  },

  // 处理测试支付
  async processTestPayment(payment_no) {
    try {
      const { PaymentAPI } = require('../../../utils/api');
      const confirmResult = await PaymentAPI.confirmTestPayment(payment_no);

      if (confirmResult.data && confirmResult.data.success) {
        wx.showToast({
          title: '支付成功',
          icon: 'success',
          duration: 1500
        });
        setTimeout(() => {
          this.paymentSuccess();
        }, 1500);
      } else {
        wx.showToast({
          title: confirmResult.message || '支付确认失败',
          icon: 'none'
        });
      }
    } catch (err) {
      wx.showToast({
        title: err.message || '支付确认异常',
        icon: 'none'
      });
    }
  },

  // 解析或生成 openid
  resolveOpenId() {
    return new Promise((resolve, reject) => {
      const app = getApp();
      console.log('[详情页] 开始获取 OpenID');
      
      // 1. 优先使用全局缓存
      if (app.globalData.openid) {
        console.log('[详情页] 使用全局缓存的 OpenID:', app.globalData.openid);
        return resolve(app.globalData.openid);
      }

      // 2. 尝试从本地存储读取
      const cached = wx.getStorageSync('openid');
      if (cached) {
        console.log('[详情页] 使用本地存储的 OpenID:', cached);
        app.globalData.openid = cached;
        return resolve(cached);
      }

      // 3. 开发环境 Mock 逻辑
      const isDev = /localhost|127\.0\.0\.1|:3000/.test(app.globalData.baseUrl || '');
      console.log('[详情页] isDev:', isDev, 'baseUrl:', app.globalData.baseUrl);
      
      if (isDev && !app.globalData.useRealOpenId) { 
        const mock = `MOCK_OPENID_${Math.floor(Math.random() * 100000)}`;
        console.log('[详情页] 使用 Mock OpenID:', mock);
        wx.setStorageSync('openid', mock);
        app.globalData.openid = mock;
        return resolve(mock);
      }

      // 4. 调用 wx.login + 后端 code2session
      console.log('[详情页] 调用 wx.login 获取真实 OpenID');
      wx.login({
        success: (res) => {
          if (res.code) {
            console.log('[详情页] wx.login 成功，code:', res.code);
            // 调用后端接口
            wx.request({
              url: `${app.globalData.baseUrl}/auth/code2session`,
              method: 'POST',
              data: { code: res.code },
              success: (apiRes) => {
                console.log('[详情页] code2session 后端响应:', apiRes.data);
                // 兼容后端返回 code 为 0 或 200
                if (apiRes.data.code === 0 || apiRes.data.code === 200 || apiRes.data.success) {
                  const openid = apiRes.data.data.openid;
                  console.log('[详情页] 获取到 OpenID:', openid);
                  // 缓存 OpenID
                  app.globalData.openid = openid;
                  wx.setStorageSync('openid', openid);
                  resolve(openid);
                } else {
                  console.error('[详情页] 获取 OpenID 失败，后端返回:', apiRes.data);
                  reject(new Error(apiRes.data.message || '获取OpenID失败'));
                }
              },
              fail: (err) => {
                console.error('[详情页] 请求后端失败:', err);
                reject(new Error('请求后端获取OpenID失败'));
              }
            });
          } else {
            console.error('[详情页] wx.login 未返回 code:', res);
            reject(new Error('微信登录失败: ' + res.errMsg));
          }
        },
        fail: (err) => {
          console.error('[详情页] wx.login 调用失败:', err);
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
  },

  // 确认金额（用户）
  confirmAmount() {
    const app = getApp();

    wx.request({
      url: `${app.globalData.baseUrl}/orders/${this.data.orderId}/confirm-amount`,
      method: 'POST',
      header: {
        'Authorization': `Bearer ${app.globalData.token}`
      },
      success: (res) => {
        if (res.data.code === 0) {
          wx.showToast({ title: '金额已确认', icon: 'success' });
          this.loadOrderDetail();
        } else {
          wx.showToast({ title: res.data.message || '确认失败', icon: 'none' });
        }
      },
      fail: () => {
        wx.showToast({ title: '网络错误，请重试', icon: 'none' });
      }
    });
  },

  // 格式化时间
  formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleString();
  }
});
