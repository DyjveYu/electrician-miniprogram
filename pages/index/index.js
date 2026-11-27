const enterpriseSession = require('../../utils/enterpriseSession');
const orderSubscription = require('../../utils/orderSubscription');
// pages/index/index.js
const app = getApp();
const { SystemAPI, OrderAPI, AuthAPI } = require('../../utils/api');
const { formatTime, formatDistance, getOrderStatusText } = require('../../utils/util');

const defaultOrderImage = '/images/content-ui/clipboard.svg';
function addressRegionParts(address) {
  const { province, city, district } = address || {};
  return [province, city, district].map(value => value?.trim()).filter(Boolean);
}

function displayServiceAddress(order) {
  const parts = addressRegionParts(order.address);
  const originalPrefix = parts.join('');
  const region = parts.filter((part, index) => part !== parts[index - 1]).join('');
  const snapshot = order.service_address?.trim();
  let address = snapshot || order.address?.detail_address?.trim() || '';
  // 老订单的详细地址和快照都可能已带省市区，行政区只补一次。
  if (region) {
    const prefixes = [originalPrefix, region];
    let prefix = prefixes.find(part => address.startsWith(part));
    if (prefix || !snapshot) {
      while (prefix) {
        address = address.slice(prefix.length).trimStart();
        prefix = prefixes.find(part => address.startsWith(part));
      }
      return region + address;
    }
  }
  // 地址簿记录已删除时，只去掉快照开头完全相同的重复行政区。
  return address.replace(/^([\u3400-\u9fff]{1,20}(?:省|自治区|市)[\u3400-\u9fff]{1,24}(?:市|州|区|县|旗))(?:\s*\1)+/, '$1');
}

function orderCard(order, imageBaseUrl) {
  const path = Array.isArray(order.images) ? order.images.find(image => typeof image === 'string' && image.trim())?.trim() : '';
  let image = defaultOrderImage;
  if (/^https?:\/\//i.test(path || '')) image = path;
  else if (/^\/?uploads\//.test(path || '')) {
    image = `${(imageBaseUrl || '').replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
  }
  const project = order.order_type === 'enterprise_project';
  const offsite = order.service_mode === 'off_site';
  let feeLabel = project ? '工程总费用' : '上门费';
  let amount = project ? order.proj_total_amount ?? order.prepay_amount : order.prepay_amount;
  if (offsite) {
    const fixedPrice = order.pricing_mode === 'fixed_price';
    feeLabel = fixedPrice ? '一口价' : '订单押金';
    amount = fixedPrice ? order.prepay_amount : (project ? 200 * Number(order.proj_required_count) : 200);
  }
  return {
    cardImage: image,
    cardDescription: order.description || order.title || '电工服务',
    cardAddress: offsite
      ? addressRegionParts(order.service_region).filter((part, index, parts) => part !== parts[index - 1]).join('')
      : displayServiceAddress(order),
    cardDeadline: order.accept_expires_at && Number.isFinite(Date.parse(order.accept_expires_at))
      ? formatTime(order.accept_expires_at, 'YYYY-MM-DD HH:mm') : '',
    cardFeeLabel: feeLabel,
    cardFee: amount != null && Number.isFinite(Number(amount)) ? Number(amount).toFixed(2) : ''
  };
}

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
    nearbyOrders: [], nearbyError: '', orderTab: 'onsite', defaultOrderImage,
    navTop: 24, navHeight: 44, navInset: 96,
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
    this.measureHomeNavigation();

    const referrerId = this._getReferrerId(options);
    this._tryReferrerRedirect(referrerId);
  },

  onShow() {
    this._subscriptionVisible = true;
    this._homeHidden = false;
    if (this._referrerRedirecting) return;

    const storedReferrerId = wx.getStorageSync('referrer_id');
    if (this._tryReferrerRedirect(storedReferrerId)) return;

    if (!this.checkLogin() || app.checkFrozenAndRedirect()) {
      this.stopOrderPolling();
      return;
    }

    const currentRole = app.globalData.currentRole || 'user';
    this.measureHomeNavigation();
    this.setHomeTabBar(currentRole === 'electrician');
    if (currentRole === 'electrician' && !this._orderPollCurrent?.()) {
      this.stopOrderPolling();
      if (!this._orderListOwner?.()) {
        this.clearOrderLists();
      }
      this._orderListOwner = this.captureOrderIdentity();
      this.startOrderPolling();
    } else if (currentRole !== 'electrician') {
      this.stopOrderPolling();
      this._orderListOwner = null;
    }
    this.initPage();
  },

  onHide() {
    if (this.data.currentRole === 'electrician') this.setHomeTabBar(false);
    this._nationalObserver?.disconnect();
    this._nationalObserver = null;
    orderSubscription.hide(this);
    this._homeHidden = true;
    this.stopOrderPolling();
    this._pullRefresh = null;
    this.setData({ homeRefreshing: false });
  },
  onUnload() { this.onHide(); },
  onResize() { this.measureHomeNavigation(); },

  measureHomeNavigation() {
    let windowInfo;
    let capsule;
    try { windowInfo = wx.getWindowInfo?.() || wx.getSystemInfoSync?.(); } catch (_) {}
    try { capsule = wx.getMenuButtonBoundingClientRect?.(); } catch (_) {}
    const navTop = Math.max(windowInfo?.statusBarHeight || 0, windowInfo?.safeArea?.top || 0) || 24;
    const hasCapsule = capsule?.width > 0 && capsule?.height > 0 && capsule.top >= navTop;
    const capsuleLeft = capsule?.left;
    const width = windowInfo?.windowWidth;
    this.setData({
      navTop,
      navHeight: hasCapsule ? capsule.height + (capsule.top - navTop) * 2 : 44,
      navInset: hasCapsule && capsuleLeft > 0 && width > capsuleLeft ? width - capsuleLeft + 4 : 96
    });
  },

  setHomeTabBar(electrician) {
    wx.setTabBarStyle?.({
      color: electrician ? '#666666' : '#7A7E83',
      selectedColor: electrician ? '#009988' : '#0F9D58'
    });
  },

  clearOrderLists() {
    this.setData({
      nearbyOrders: [], nearbyError: '', nationalOrders: [], nationalPage: 0, nationalHasMore: true,
      nationalError: '', orderTab: 'onsite'
    });
  },

  captureOrderIdentity() {
    const { token, userInfo } = app.globalData;
    const userId = userInfo?.id;
    const session = app._orderSessionVersion;
    return () => Boolean(token && app.globalData.isLogin && token === app.globalData.token &&
      session === app._orderSessionVersion && userId != null &&
      userId === app.globalData.userInfo?.id &&
      app.globalData.userInfo?.current_role === 'electrician' &&
      app.globalData.currentRole === 'electrician' &&
      !app._enterpriseCacheCheck && !app._enterpriseCertificationSession);
  },

  captureOrderView() {
    const identity = this.captureOrderIdentity();
    const version = this._orderViewVersion;
    return () => !this._homeHidden && version === this._orderViewVersion && identity();
  },

  stopOrderPolling() {
    if (this._orderPollTimer != null) clearInterval(this._orderPollTimer);
    this._orderPollTimer = null;
    this._orderPollCurrent = null;
    this._orderViewVersion = (this._orderViewVersion || 0) + 1;
    this.setData({ loading: false, nationalLoading: false });
  },

  startOrderPolling() {
    const current = this.captureOrderView();
    if (!current()) return;
    this._orderPollCurrent = current;
    this._orderPollTimer = setInterval(() => {
      if (this._orderPollCurrent !== current) return;
      if (!current()) {
        this.stopOrderPolling();
        this._orderListOwner = null;
        this.clearOrderLists();
        return;
      }
      this.refreshAvailableOrders('poll');
    }, 10000);
  },

  subscribeNewOrders() { orderSubscription.subscribe(this); },

  async onPullDownRefresh() {
    if (this.data.homeRefreshing) return;
    const refresh = this._pullRefresh = {};
    this.setData({ homeRefreshing: true });
    try { await this.loadData('manual'); }
    finally {
      if (this._pullRefresh === refresh) {
        this._pullRefresh = null;
        this.setData({ homeRefreshing: false });
        wx.stopPullDownRefresh();
      }
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
          wx.showModal({
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
  async loadData(source = 'entry') {
    if (this.data.currentRole === 'electrician') {
      await Promise.allSettled([this.refreshAvailableOrders(source), orderSubscription.load(this)]);
    } else {
      this.setData({ orderSubscriptionEnabled: false });
      this.clearOrderLists();
    }
  },

  async refreshAvailableOrders(source) {
    const current = this.captureOrderView();
    if (!current()) return;
    // Wait for older work to finish when a page resumes or the user requests a refresh.
    while (this._orderWork) {
      if (source === 'poll') return;
      const work = this._orderWork;
      const results = await work.promise;
      if (!current()) return;
      if (work.refresh && work.current()) {
        if (source === 'manual') this.showOrderRefreshError(results);
        return;
      }
    }

    const silent = source === 'poll';
    const work = { current, refresh: true };
    work.promise = Promise.all([
      this.loadNearbyOrders({ silent, reportError: false }),
      this.loadNationalOrders(true, { silent, preservePages: source !== 'manual' })
    ]).finally(() => { this._orderWork = null; });
    this._orderWork = work;
    const results = await work.promise;
    if (source === 'manual' && current()) this.showOrderRefreshError(results);
  },

  showOrderRefreshError(results) {
    const error = results.find(Boolean);
    if (error) wx.showToast({ title: error, icon: 'none' });
  },

  selectOrderTab(event) {
    const { tab } = event.currentTarget.dataset;
    if (tab !== this.data.orderTab && (tab === 'onsite' || tab === 'offsite')) {
      this.setData({ orderTab: tab }, () => this.observeNationalPagination());
    }
  },
  observeNationalPagination() {
    this._nationalObserver?.disconnect();
    this._nationalObserver = null;
    const { orderTab, nationalPage, nationalHasMore, nationalError } = this.data;
    if (!this.createIntersectionObserver || this._homeHidden || orderTab !== 'offsite'
      || !nationalPage || !nationalHasMore || nationalError) return;
    const observer = this.createIntersectionObserver();
    this._nationalObserver = observer;
    observer.relativeTo('.home-scroll').observe('.national-pagination-sentinel', ({ intersectionRatio }) => {
      if (this._nationalObserver !== observer || !intersectionRatio) return;
      this.loadMoreNationalOrders('offsite');
    });
  },
  onOrderScrollLower() {
    if (!this._nationalObserver && this.data.currentRole === 'electrician' && this.data.orderTab === 'offsite') {
      return this.loadMoreNationalOrders('offsite');
    }
  },
  retryNearbyOrders() { return this.refreshAvailableOrders('resume'); },
  onOrderImageError(event) {
    const { index, tab, source } = event.currentTarget.dataset;
    const list = tab === 'offsite' ? 'nationalOrders' : 'nearbyOrders';
    if (source !== defaultOrderImage && this.data[list][index]?.cardImage === source) {
      this.setData({ [`${list}[${index}].cardImage`]: defaultOrderImage });
    }
  },

  async loadMoreNationalOrders(tab) {
    const current = this.captureOrderView();
    const work = this._orderWork;
    if (work?.refresh) await work.promise;
    if (!current() || (tab && this.data.orderTab !== tab)) return;
    if (!this.data.nationalError && this.data.nationalPage > 0 && this.data.nationalHasMore) {
      return this.runNationalPaging(false);
    }
  },
  retryNationalOrders() { return this.runNationalPaging(this._nationalRetryReset); },

  runNationalPaging(reset) {
    if (this._orderWork) return;
    const work = {};
    work.promise = this.loadNationalOrders(reset).finally(() => { this._orderWork = null; });
    this._orderWork = work;
    return work.promise;
  },

  async loadNationalOrders(reset = true, { silent = false, preservePages = false } = {}) {
    const current = this.captureOrderView();
    if (!current()) return;
    const firstPage = reset ? 1 : this.data.nationalPage + 1;
    const lastPage = preservePages ? Math.max(1, this.data.nationalPage) : firstPage;
    if (!silent) this.setData({ nationalLoading: true, nationalError: '' });
    try {
      const orders = new Map(reset ? [] : this.data.nationalOrders.map(order => [String(order.id), order]));
      let loadedPage = firstPage;
      let pages;
      for (let page = firstPage; page <= lastPage; page++) {
        const result = await OrderAPI.getOrderList(
          { my_orders: false, order_scope: 'nationwide', page, limit: 20 }, { showError: false }
        );
        if (!current()) return;
        pages = Number(result.data?.pages);
        if (!Array.isArray(result.data?.list) || !Number.isInteger(pages) || pages < 0) {
          throw new Error('全国订单响应未确认');
        }
        for (const order of result.data.list) {
          if (!order.id || orders.has(String(order.id))) continue;
          const presentation = require('../../utils/personalOrder').labels(order);
          orders.set(String(order.id), {
            ...order, ...presentation, ...orderCard(order, app.globalData.imageBaseUrl), statusText: presentation.offsiteStatusName,
            createdTime: order.created_at ? formatTime(order.created_at) : '未记录'
          });
        }
        loadedPage = page;
        if (page >= pages) break;
      }
      this.setData({ nationalOrders: [...orders.values()], nationalPage: loadedPage,
        nationalHasMore: loadedPage < pages, nationalError: '' }, () => this.observeNationalPagination());
    } catch (error) {
      if (!current()) return;
      const message = error.message || '全国订单读取失败';
      if (!silent) {
        this._nationalRetryReset = reset;
        this.setData({ nationalError: message });
      }
      return message;
    } finally {
      if (!silent && current()) this.setData({ nationalLoading: false });
    }
  },
  viewNationalOrders() { wx.navigateTo({ url: '/pages/order/nationwide/nationwide' }); },
  viewNationalOrder(e) { wx.navigateTo({ url: `/pages/order/detail/detail?id=${e.currentTarget.dataset.id}` }); },
  async loadNearbyOrders({ silent = false, reportError = true } = {}) {
    const viewCurrent = this.captureOrderView();
    if (!viewCurrent()) return;
    const version = this._nearbyRequestVersion = (this._nearbyRequestVersion || 0) + 1;
    const current = () => viewCurrent() && version === this._nearbyRequestVersion;
    if (!silent) this.setData({ loading: true, nearbyError: '' });
    try {
      const response = await OrderAPI.getOrderList({ page: 1, limit: 20, my_orders: false }, { showError: false });
      if (!current()) return;
      const orders = response.data?.list || response.data?.orders;
      if (response.success === false || ![0, 200].includes(response.code) || !Array.isArray(orders)) {
        throw new Error(response.message || '加载订单失败');
      }
      const truncate = (value) => value?.length > 12 ? value.substring(0, 12) + '...' : value || '';
      const orderTypeMap = {
        enterprise_project: '企业多日工程',
        enterprise_quick: '企业快修订单',
        personal_quick: '个人快修订单'
      };
      const nearbyOrders = orders.filter(order => order.service_mode !== 'off_site').map(order => {
        const status = order.status === 'confirmed' ? 'in_progress' : order.status;
        return {
          ...order,
          ...orderCard(order, app.globalData.imageBaseUrl),
          title: truncate(order.title),
          description: truncate(order.description),
          orderTypeText: orderTypeMap[order.order_type] || order.order_type || '电工服务',
          status,
          statusText: getOrderStatusText(status),
          createdTime: formatTime(order.created_at),
          distance: this.calculateDistance(order.latitude, order.longitude)
        };
      });
      this.setData({ nearbyOrders, nearbyError: '' });
    } catch (error) {
      if (!current()) return;
      const message = error.message || '加载订单失败';
      if (!silent) this.setData({ nearbyError: message });
      if (!silent && reportError) wx.showToast({ title: '加载订单失败', icon: 'none' });
      return message;
    } finally {
      if (!silent && current()) this.setData({ loading: false });
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
        this.loadData('manual');
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
            wx.showModal({
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



});
