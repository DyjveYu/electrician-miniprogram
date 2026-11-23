const enterpriseSession = require('../../utils/enterpriseSession');
const orderSubscription = require('../../utils/orderSubscription');
// pages/index/index.js
const app = getApp();
const { SystemAPI, OrderAPI, AuthAPI } = require('../../utils/api');
const { formatTime, formatDistance, getOrderStatusText } = require('../../utils/util');

require('../../utils/visitCapture').register(Page, {
  data: {
    nationalOrders: [], nationalLoading: false, nationalError: '', nationalHasMore: true, nationalPage: 0,
    homeRefreshing: false,
    orderSubscriptionEnabled: false, orderSubscriptionTemplate: '', orderSubscriptionBusy: false,
    userInfo: null,
    currentRole: 'user', // 当前用户角色
    locationText: '北京市朝阳区',
    latitude: null,
    longitude: null,
    nearbyOrders: [],
    loading: false
  },

  /**
   * 尝试跳转到推荐达人落地页
   */
  _tryReferrerRedirect(referrerId) {
    if (!referrerId) return false;
    this._referrerRedirecting = true;
    wx.removeStorageSync('referrer_id');
    wx.redirectTo({
      url: `/pages/order-landing/index?referrer_id=${referrerId}`
    });
    return true;
  },

  /**
   * 获取推荐人 ID：优先从 options.query，后备从 storage
   */
  _getReferrerId(options) {
    if (options && options.referrer_id) return options.referrer_id;
    const stored = wx.getStorageSync('referrer_id');
    return stored || null;
  },

  onLoad(options) {
    console.log('首页加载 options=', options);

    const referrerId = this._getReferrerId(options);
    if (this._tryReferrerRedirect(referrerId)) return;

    if (!this.checkLogin()) {
      return;
    }
    this.initPage();
  },

  onShow() {
    this._subscriptionVisible = true;
    this._homeHidden = false;
    console.log('首页显示');
    if (this._referrerRedirecting) return;

    const storedReferrerId = wx.getStorageSync('referrer_id');
    if (this._tryReferrerRedirect(storedReferrerId)) return;

    if (!this.checkLogin()) {
      return;
    }
    if (app.checkFrozenAndRedirect()) {
      return;
    }
    this.initPage();
  },

  onHide() {
    orderSubscription.hide(this);
    this._homeHidden = true;
    this._nationalVersion = (this._nationalVersion || 0) + 1;
    this.setData({ nationalLoading: false, homeRefreshing: false });
  },
  onUnload() { this.onHide(); },
  subscribeNewOrders() { orderSubscription.subscribe(this); },

  async onPullDownRefresh() {
    if (this.data.homeRefreshing) return;
    this.setData({ homeRefreshing: true });
    try { await this.loadData(); }
    finally {
      this.setData({ homeRefreshing: false });
      wx.stopPullDownRefresh();
    }
  },

  /**
   * 检查登录状态
   */
  checkLogin() {
    const app = getApp();
    if (app._enterpriseCacheCheck || app._enterpriseCertificationSession) return false;
    console.log('checkLogin: globalData.isLogin=', app.globalData.isLogin ? 'true' : 'false');
    console.log('checkLogin: globalData.token=', app.globalData.token ? '存在' : '不存在');
    let isLogin = app.globalData.isLogin;
    let token = app.globalData.token;

    console.log('[首页] 检查全局登录状态:', {
      isLogin: isLogin,
      token: token ? '存在' : '不存在'
    });

    // 如果全局数据未就绪，尝试从Storage读取（双重保障）
    if (!token) {
      console.log('[首页] 全局Token不存在，尝试从Storage读取...');
      try {
        token = wx.getStorageSync('token');
        const userInfo = wx.getStorageSync('userInfo');

        if (token && userInfo) {
          console.log('[首页] 从Storage恢复登录状态成功');
          // 恢复全局数据
          app.globalData.token = token;
          app.globalData.userInfo = userInfo;
          app.globalData.isLogin = true;
          app.globalData.currentRole = userInfo.current_role || 'user';
          isLogin = true;
        } else {
          console.log('[首页] Storage中也未找到登录信息');
        }
      } catch (e) {
        console.error('[首页] 读取Storage失败:', e);
      }
    }

    if (!isLogin || !token) {
      console.log('[首页] 未登录，跳转到登录页');
      wx.reLaunch({ url: '/pages/login/login' });
      return false;
    }

    console.log('[首页] 已登录');
    return true;
  },

  /**
   * 初始化页面
   */
  initPage() {
    // 获取用户角色
    const currentRole = app.globalData.currentRole || 'user';
    this.setData({ currentRole });

    // 获取用户位置
    this.getCurrentLocation();

    // 加载数据
    this.loadData();

    // 检测待评价企业多日工程工单（仅企业/电工角色）
    if (currentRole === 'enterprise' || currentRole === 'electrician') {
      this.checkPendingReview();
    }
  },

  /**
   * 检测待评价企业多日工程工单，弹框提醒
   */
  checkPendingReview() {
    const app = getApp();
    enterpriseSession.request({
      url: `${app.globalData.baseUrl}/orders/pending-review-check`,
      method: 'GET',
      header: { Authorization: `Bearer ${app.globalData.token}` },
      success: (res) => {
        const ok = res?.data?.code === 0 || res?.data?.code === 200 || res?.data?.success === true;
        if (!ok) return;

        const data = res.data.data || res.data;
        if (data.hasPending && data.orderId) {
          wx.showModal({ confirmColor: '#16835c',
            title: '工单已结束',
            content: '工单已结束，请完成评价',
            confirmText: '去评价',
            cancelText: '稍后',
            success: (modalRes) => {
              if (modalRes.confirm) {
                // 企业跳转评价页（评价多位电工），电工跳转评价企业页
                const role = app.globalData.currentRole;
                if (role === 'enterprise') {
                  wx.navigateTo({
                    url: `/pages/enterprise/project-review/project-review?orderId=${data.orderId}`
                  });
                } else if (role === 'electrician') {
                  wx.navigateTo({
                    url: `/pages/enterprise/electrician-review/electrician-review?orderId=${data.orderId}`
                  });
                }
              }
            }
          });
        }
      }
    });
  },

  /**
   * 获取当前位置
   */
  getCurrentLocation() {
    wx.getLocation({
      type: 'gcj02',
      success: (res) => {
        this.setData({
          latitude: res.latitude,
          longitude: res.longitude
        });

        // 逆地理编码获取地址
        this.reverseGeocode(res.latitude, res.longitude);
      },
      fail: (err) => {
        console.log('获取位置失败:', err);
        // 使用默认位置
        this.setData({
          locationText: '北京市朝阳区'
        });
      }
    });
  },

  /**
   * 逆地理编码
   */
  reverseGeocode(latitude, longitude) {
    // 这里可以调用地图API进行逆地理编码
    // 暂时使用默认地址
    this.setData({
      locationText: '当前位置'
    });
  },

  /**
   * 加载数据
   */
  async loadData() {
    if (this.data.currentRole === 'electrician') {
      await Promise.allSettled([this.loadNearbyOrders(), this.loadNationalOrders(), orderSubscription.load(this)]);
    } else {
      this.setData({ orderSubscriptionEnabled: false });
      this.setData({ nationalOrders: [], nationalPage: 0, nationalHasMore: true });
    }
  },

  /**
   * 加载附近订单（电工角色）
   */
  loadMoreNationalOrders() {
    if (!this.data.nationalError && this.data.nationalPage > 0 && this.data.nationalHasMore) {
      return this.loadNationalOrders(false);
    }
  },
  retryNationalOrders() { return this.loadNationalOrders(this.data.nationalPage === 0); },
  async loadNationalOrders(reset = true) {
    const app = getApp();
    const user = app.globalData.userInfo;
    if (this._homeHidden || user?.current_role !== 'electrician' || (!reset && this.data.nationalLoading)) return;
    const token = app.globalData.token;
    const session = app._orderSessionVersion;
    const version = this._nationalVersion = (this._nationalVersion || 0) + 1;
    const current = () => !this._homeHidden && version === this._nationalVersion &&
      token === app.globalData.token && session === app._orderSessionVersion &&
      user.id === app.globalData.userInfo?.id && app.globalData.userInfo?.current_role === 'electrician';
    const page = reset ? 1 : this.data.nationalPage + 1;
    this.setData({
      nationalLoading: true, nationalError: '',
      ...(reset && { nationalPage: 0, nationalOrders: [], nationalHasMore: true })
    });
    try {
      const result = await OrderAPI.getOrderList({ my_orders: false, order_scope: 'nationwide', page, limit: 20 });
      if (!current()) return;
      const pages = Number(result.data?.pages);
      if (!Array.isArray(result.data?.list) || !Number.isInteger(pages) || pages < 0) {
        throw new Error('全国订单响应未确认');
      }
      const orders = new Map(this.data.nationalOrders.map(order => [String(order.id), order]));
      for (const order of result.data.list) {
        if (!order.id || orders.has(String(order.id))) continue;
        const presentation = require('../../utils/personalOrder').labels(order);
        orders.set(String(order.id), {
          ...order, ...presentation, statusText: presentation.offsiteStatusName,
          createdTime: order.created_at ? formatTime(order.created_at) : '未记录'
        });
      }
      this.setData({ nationalOrders: [...orders.values()], nationalPage: page, nationalHasMore: page < pages });
    } catch (error) {
      if (current()) this.setData({ nationalError: error.message || '全国订单读取失败' });
    } finally {
      if (current()) this.setData({ nationalLoading: false });
    }
  },
  viewNationalOrders() { wx.navigateTo({ url: '/pages/order/nationwide/nationwide' }); },
  viewNationalOrder(e) { wx.navigateTo({ url: `/pages/order/detail/detail?id=${e.currentTarget.dataset.id}` }); },
  async loadNearbyOrders() {
    const version = this._nearbyRequestVersion = (this._nearbyRequestVersion || 0) + 1;
    try {
      console.log('[DEBUG] 开始加载附近订单...');
      this.setData({ loading: true });

      const params = {
        page: 1,
        limit: 20,
        my_orders: false // 获取可接的订单（后端默认返回 pending + recruiting）
      };

      console.log('[DEBUG] 请求参数:', params);

      // 暂时移除地理位置参数，避免后端查询错误
      // TODO: 后续实现完整的地理位置筛选功能

      const response = await OrderAPI.getOrderList(params);
      if (version !== this._nearbyRequestVersion) return;
      console.log('[DEBUG] API响应:', response);

      if (response.code === 200) {
        // 根据后端返回的数据结构，订单数据在response.data.list中
        const orders = response.data.list || response.data.orders || [];
        console.log('[DEBUG] 解析到的订单数据:', orders);
        console.log('[DEBUG] 订单数量:', orders.length);

        if (orders.length === 0) {
          console.log('[DEBUG] 没有找到可接的订单');
          this.setData({
            nearbyOrders: []
          });
          wx.showToast({
            title: '暂无可接订单',
            icon: 'none'
          });
          return;
        }

        const truncate = (str, maxLen = 12) => {
          if (!str) return '';
          return str.length > maxLen ? str.substring(0, maxLen) + '...' : str;
        };

        const orderTypeMap = {
          enterprise_project: '企业多日工程',
          enterprise_quick: '企业快修订单',
          personal_quick: '个人快修订单'
        };

        const formattedOrders = orders.map(order => {
          console.log('[DEBUG] 处理订单:', order.id, order.title);
          const normalizedStatus = order.status === 'confirmed' ? 'in_progress' : order.status;
          return {
            ...order,
            title: truncate(order.title),
            description: truncate(order.description),
            orderTypeText: orderTypeMap[order.order_type] || order.order_type || '电工服务',
            status: normalizedStatus,
            statusText: getOrderStatusText(normalizedStatus),
            createdTime: formatTime(order.created_at),
            distance: this.calculateDistance(order.latitude, order.longitude)
          };
        });

        console.log('[DEBUG] 格式化后的订单:', formattedOrders);

        this.setData({
          nearbyOrders: formattedOrders
        });

        console.log('[DEBUG] 订单数据已设置到页面');
      } else {
        console.error('[DEBUG] API返回错误:', response.message);
        wx.showToast({
          title: response.message || '加载订单失败',
          icon: 'none'
        });
      }
    } catch (error) {
      if (version !== this._nearbyRequestVersion) return;
      console.error('[DEBUG] 加载附近订单失败:', error);
      wx.showToast({
        title: '加载订单失败',
        icon: 'none'
      });
    } finally {
      if (version === this._nearbyRequestVersion) this.setData({ loading: false });
      console.log('[DEBUG] 加载附近订单完成');
    }
  },

  /**
   * 计算距离
   */
  calculateDistance(lat, lng) {
    if (!this.data.latitude || !this.data.longitude || !lat || !lng) {
      return '';
    }

    const distance = formatDistance(
      this.data.latitude,
      this.data.longitude,
      lat,
      lng
    );

    return distance;
  },

  /**
   * 点击位置
   */
  onLocationTap() {
    wx.chooseLocation({
      success: (res) => {
        this.setData({
          locationText: res.name || res.address,
          latitude: res.latitude,
          longitude: res.longitude
        });
        // 重新加载数据
        this.loadData();
      }
    });
  },

  /**
   * 创建订单（用户角色）
   */
  createOrder() {
    // 检查登录状态
    const app = getApp();
    if (!app.globalData.token || !app.globalData.userInfo) {
      wx.showToast({
        title: '请先登录',
        icon: 'none',
        duration: 1500
      });
      setTimeout(() => {
        wx.navigateTo({
          url: '/pages/login/login'
        });
      }, 1500);
      return;
    }

    // 检查用户角色
    if (this.data.currentRole !== 'user' && this.data.currentRole !== 'enterprise') {
      wx.showToast({
        title: '请切换到用户或企业身份',
        icon: 'none'
      });
      return;
    }

    // 跳转到创建订单页
    wx.navigateTo({
      url: '/pages/order/create/create'
    });
  },

  /**
   * 查看所有订单
   */
  viewAllOrders() {
    wx.switchTab({
      url: '/pages/order/list/list'
    });
  },

  /**
   * 查看订单详情
   */
  viewOrderDetail(e) {
    const orderId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/order/detail/detail?id=${orderId}`
    });
  },

  /**
   * 接单（电工角色）
   */
  takeOrder(e) {
    const orderId = e.currentTarget.dataset.id;
    const app = getApp();

    if (this.data.currentRole !== 'electrician') {
      wx.showToast({
        title: '请切换到电工身份',
        icon: 'none'
      });
      return;
    }

    // 检查账号是否被冻结
    if (app.globalData.userInfo && app.globalData.userInfo.status === 'banned') {
      wx.showToast({
        title: '您的账号已被冻结，无法接单',
        icon: 'none'
      });
      return;
    }

    // 检查押金状态
    this.checkDepositAndTakeOrder(orderId);
  },

  /**
   * 检查押金状态后接单
   */
  checkDepositAndTakeOrder(orderId) {
    const app = getApp();

    enterpriseSession.request({
      url: `${app.globalData.baseUrl}/deposits/status`,
      method: 'GET',
      header: { 'Authorization': `Bearer ${app.globalData.token}` },
      success: (res) => {
        if (res.data.code === 200) {
          const data = res.data.data || {};
          if (data.status !== 'paid') {
            wx.showModal({ confirmColor: '#16835c',
              title: '提示',
              content: '需要缴纳押金后才能接单，是否前往缴纳？',
              confirmText: '去缴纳',
              success: (modalRes) => {
                if (modalRes.confirm) {
                  wx.navigateTo({
                    url: '/pages/profile/deposit/deposit'
                  });
                }
              }
            });
            return;
          }
          // 押金已缴，跳转到订单详情页
          wx.navigateTo({
            url: `/pages/order/detail/detail?id=${orderId}&action=take`
          });
        } else {
          // API失败，仍然尝试接单（后端会做最终检查）
          wx.navigateTo({
            url: `/pages/order/detail/detail?id=${orderId}&action=take`
          });
        }
      },
      fail: () => {
        // 网络错误，仍然尝试接单（后端会做最终检查）
        wx.navigateTo({
          url: `/pages/order/detail/detail?id=${orderId}&action=take`
        });
      }
    });
  },



  /**
   * 刷新订单列表
   */
  refreshOrders() {
    this.loadData();
  }
});
