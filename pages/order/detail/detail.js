// pages/order/detail/detail.js
const app = getApp();
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
    // 检查是否被冻结
    if (app.checkFrozenAndRedirect()) {
      return;
    }
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
          const prepayAmount = raw.prepay_amount ||
            (raw.serviceType && raw.serviceType.prepay_amount) ||
            raw.estimated_amount ||
            raw.amount ||
            30;
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
            ? {
              rating: raw.review.rating,
              content: raw.review.content || ''
            }
            : null;
          // 图片URL归一化：相对路径拼接 imageBaseUrl
          const normalizeImageUrl = (url) => {
            const rawUrl = url;
            console.log('[detail] 图片归一化前:', rawUrl);
            if (!url) {
              console.log('[detail] 图片归一化后: (空)');
              return '';
            }
            if (/^https?:\/\//.test(url)) {
              console.log('[detail] 图片归一化后: (已是完整URL) ->', url);
              return url;
            }
            if (url.startsWith('/')) {
              const result = app.globalData.imageBaseUrl + url;
              console.log('[detail] 图片归一化后: (相对路径拼接) ->', result, '| imageBaseUrl:', app.globalData.imageBaseUrl);
              return result;
            }
            const m = url.match(/\/uploads\/.+$/);
            const result = app.globalData.imageBaseUrl + (m ? m[0] : '/' + url);
            console.log('[detail] 图片归一化后: (畸形URL提取) ->', result, '| 匹配:', m ? m[0] : '无');
            return result;
          };

          const order = {
            ...raw,
            review: normalizedReview,
            electrician: normalizedElectrician,
            // 字段名映射，兼容后端字段
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
            // 优先从 serviceType 获取预付款金额，其次从订单字段
            amount: prepayAmount,
            repairAmount,
            prefillUpdateAmount,
            // 用电类型映射
            electricityTypeName: raw.electricityTypeName || (raw.electricity_type === 'industrial' ? '工业用电' : raw.electricity_type === 'residential' ? '居民用电' : ''),
            // 多日工程：格式化工程时间（YYYY-MM-DD HH:mm）
            projStartTimeShort: raw.projStartTime ? this.formatShortTime(raw.projStartTime) : '',
            projEndTimeShort: raw.projEndTime ? this.formatShortTime(raw.projEndTime) : '',
            // 多日工程：实际到账金额（扣除15%平台费）
            projActualAmount: raw.projTotalAmount ? (Number(raw.projTotalAmount) * 0.85).toFixed(2) : null,
            // 工单类型中文映射
            orderTypeText: this.getOrderTypeText(raw.order_type || raw.orderType)
          };

          // 计算“维修安装费”合计（仅在进行中/待评价/已完成展示）
          const prepayNum = Number(order.amount) || 0;
          const repairNum = Number(order.repairAmount) || 0;
          const showInstallTotal = ['in_progress', 'pending_review', 'completed_settled'].includes(normalizedStatus);
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
          if (this.data.action === 'completed_settled') {
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
    const canAccept = role === 'electrician' && (st === 'pending' || st === 'recruiting') && !order.hasJoined;
    const canWithdraw = role === 'electrician' && (st === 'recruiting' || st === 'full') && order.hasJoined;
    const canComplete = role === 'electrician' && st === 'in_progress';
    const isPayer = role === 'user' || role === 'enterprise';
    const canConfirmAmount = isPayer && (st === 'pending_payment' || st === 'pending_repair_payment');
    const canPay = isPayer && (st === 'pending_payment' || st === 'pending_repair_payment');
    const canReview = isPayer && (st === 'pending_review' || st === 'pending_second_review') && order.order_type !== 'enterprise_project';
    const canSubmitCompletedUpdate = role === 'electrician' && (st === 'accepted' || st === 'pending_repair_payment');
    const canPayRepairFee = isPayer && st === 'pending_repair_payment';
    const canReviewProject = role === 'enterprise' && order.order_type === 'enterprise_project' && (st === 'reviewing' || st === 'pending_second_review');
    // 电工资质评价企业：多日工程 + 已接单 + 未评价 + 主表在评价阶段
    const canReviewEnterprise = role === 'electrician'
      && order.order_type === 'enterprise_project'
      && order.hasJoined
      && !order.electricianReviewed
      && ['reviewing', 'pending_second_review', 'completed_settled', 'completed_unsettle'].includes(st);
    return { canCancel, canAccept, canWithdraw, canComplete, canConfirmAmount, canPay, canReview, canSubmitCompletedUpdate, canPayRepairFee, canReviewProject, canReviewEnterprise };
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
    const order = this.data.order;
    const isPaid = order.status === 'pending'; // 已付款待接单状态

    // 根据订单状态显示不同提示
    let content = '确定要取消这个订单吗？';
    if (isPaid) {
      content = '取消订单后将原路退回预付款，是否继续？';
    }

    wx.showModal({
      title: '确认取消',
      content: content,
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
    const order = this.data.order;
    const isPaid = order.status === 'pending';

    // 根据是否已付款设置取消原因
    const cancelReason = isPaid ? '用户取消已支付订单' : '用户取消未支付订单';

    wx.request({
      url: `${app.globalData.baseUrl}/orders/${this.data.orderId}/cancel`,
      method: 'PUT',
      header: {
        'Authorization': `Bearer ${app.globalData.token}`
      },
      data: { cancel_reason: cancelReason },
      success: (res) => {
        const code = res?.data?.code;
        const ok = code === 0 || code === 200 || res.statusCode === 200 || res?.data?.success === true;
        if (ok) {
          if (isPaid) {
            wx.showToast({ title: '订单已取消，退款将原路返回', icon: 'success' });
          } else {
            wx.showToast({ title: '订单已取消', icon: 'success' });
          }
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

    // 检查账号是否被冻结
    if (app.globalData.userInfo && app.globalData.userInfo.status === 'banned') {
      wx.showToast({
        title: '您的账号已被冻结，无法接单',
        icon: 'none'
      });
      return;
    }

    // 夜间接单安全提示（22:00-次日05:00）
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

  // 退单（电工 - 多日工程）
  withdrawOrder() {
    const app = getApp();

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
          header: {
            'Authorization': `Bearer ${app.globalData.token}`
          },
          success: (res) => {
            wx.hideLoading();
            const code = res?.data?.code;
            const ok = code === 0 || code === 200 || res.statusCode === 200 || res?.data?.success === true;
            if (ok) {
              wx.showToast({
                title: '退单成功',
                icon: 'success',
                duration: 1500
              });
              setTimeout(() => {
                wx.switchTab({
                  url: '/pages/order/list/list'
                });
              }, 1500);
            } else {
              wx.showToast({ title: res?.data?.message || '退单失败', icon: 'none' });
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
          // 评价完成后检测是否满足推荐达人开通条件
          this._checkReferrerQualification();
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

  // 跳转到多日工程电工评价页（企业评价电工）
  goToProjectReview() {
    wx.navigateTo({
      url: `/pages/enterprise/project-review/project-review?orderId=${this.data.orderId}`
    });
  },

  // 跳转到多日工程评价企业页（电工评价企业）
  goToElectricianReview() {
    wx.navigateTo({
      url: `/pages/enterprise/electrician-review/electrician-review?orderId=${this.data.orderId}`
    });
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
  },

  // 格式化订单时间
  formatOrderTime(time) {
    if (!time) return '';
    const date = new Date(time);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    const second = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
  },

  // 格式化短时间（无秒）：YYYY-MM-DD HH:mm
  formatShortTime(time) {
    if (!time) return '';
    const date = new Date(time);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hour}:${minute}`;
  },

  // 工单类型映射
  getOrderTypeText(orderType) {
    const map = {
      enterprise_project: '企业多日工程',
      enterprise_quick: '企业快修订单',
      personal_quick: '个人快修订单'
    };
    return map[orderType] || orderType || '';
  },

  // 手机号脱敏：138****5678
  maskPhone(phone) {
    if (!phone || typeof phone !== 'string') return '';
    if (phone.length >= 11) {
      return phone.slice(0, 3) + '****' + phone.slice(-4);
    }
    return phone;
  },

  // 检测推荐达人开通条件并弹窗提示
  async _checkReferrerQualification() {
    try {
      const { ReferrerAPI } = require('../../../utils/api');
      const res = await ReferrerAPI.getQualification();
      const data = res?.data;
      if (data && data.is_qualified && !data.is_referrer) {
        wx.showModal({
          title: '成为推荐达人',
          content: '恭喜您已达到推荐达人条件！分享给好友下单可获得 3% 的佣金奖励。立即开通？',
          confirmText: '立即开通',
          cancelText: '稍后再说',
          success: (modalRes) => {
            if (modalRes.confirm) {
              this._activateReferrer();
            }
          }
        });
      }
    } catch (err) {
      console.warn('检测推荐达人条件失败:', err.message);
    }
  },

  // 激活推荐达人身份
  async _activateReferrer() {
    try {
      const { ReferrerAPI } = require('../../../utils/api');
      const res = await ReferrerAPI.activate();
      if (res?.code === 0 || res?.success) {
        wx.showToast({ title: '恭喜您已成为推荐达人！', icon: 'success' });
      }
    } catch (err) {
      wx.showToast({ title: err.message || '开通失败', icon: 'none' });
    }
  }
});
