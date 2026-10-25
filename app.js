// app.js
const log = require('./utils/log.js');
const runtimeConfig = require('./config/index');
App({
  globalData: {
    userInfo: null,
    token: null,
    ...runtimeConfig,
    isLogin: false,
    currentRole: 'user', // user | electrician
    systemInfo: null,
    location: null,
    mchId: '1103388382' //  添加你的商户号
  },

  onLaunch(options) {
    console.log('小程序启动', options);

    // 冷启动直达受限内容时，先保留来源，再开始异步token校验。
    const launchPath = String(options && options.path || '').replace(/^\//, '');
    this._publicContentLaunchPending = /^pages\/content\/(safety-knowledge|safety-knowledge-detail|notice-detail)\/index$/.test(launchPath);
    if (/^pages\/content\/(electrician-home|article-detail)\//.test(launchPath) ||
        (launchPath === 'pages/login/login' && options.query && options.query.entry === 'electrician-home')) {
      this.globalData.contentLoginEntry = 'electrician-home';
    }

    // 获取系统信息
    this.getSystemInfo();

    // 检查登录状态
    this.checkLoginStatus();

    // 解析推荐人参数（从分享链接/二维码进入）
    this._parseReferrer(options);

    // 位置权限不在启动阶段申请，避免重复弹窗；在真正需要定位的页面再调用
  },
  onError(err) {
    log.error('global_app_error', { errMsg: err });
  },

  onShow(options) {
    console.log('小程序显示', options);
    // 每次显示时重新解析推荐人参数（覆盖旧会话的推荐人）
    this._parseReferrer(options);
  },

  /**
   * 解析推荐人参数：从分享链接或二维码中提取 referrer_id
   * 当次会话有效，退出后失效
   */
  _parseReferrer(options) {
    if (!options) {
      console.log('[App _parseReferrer] options 为 null/undefined');
      return;
    }
    console.log('[App _parseReferrer] options=', JSON.stringify(options));
    let referrerId = null;

    // 从 query 参数中获取（分享链接）
    if (options.query && options.query.referrer_id) {
      referrerId = options.query.referrer_id;
    }
    // 从 scene 参数中获取（二维码扫码），scene 需要 decodeURIComponent
    if (options.scene) {
      const sceneStr = decodeURIComponent(options.scene);
      const match = sceneStr.match(/referrer_id=(\d+)/);
      if (match) {
        referrerId = match[1];
      }
    }

    // 从 path 中提取（如 /pages/index/index?referrer_id=123）
    if (!referrerId && options.path) {
      const pathMatch = options.path.match(/referrer_id=(\d+)/);
      if (pathMatch) {
        referrerId = pathMatch[1];
      }
    }

    if (referrerId) {
      console.log('[App] 检测到推荐人ID:', referrerId);
      wx.setStorageSync('referrer_id', referrerId);
      this.globalData.referrerId = referrerId;
    } else {
      // 没有新的推荐人参数时不清除已有缓存（允许跨页面流转）
    }
  },

  onHide() {
    console.log('小程序隐藏');
  },

  onError(msg) {
    console.error('小程序错误:', msg);
  },

  /**
   * 获取系统信息
   */
  getSystemInfo() {
    wx.getSystemInfo({
      success: (res) => {
        this.globalData.systemInfo = res;
        console.log('系统信息:', res);
      },
      fail: (err) => {
        console.error('获取系统信息失败:', err);
      }
    });
  },

  /**
   * 检查登录状态
   */
  checkLoginStatus() {
    console.log('[App] 开始检查登录状态...');

    const token = wx.getStorageSync('token');
    const userInfo = wx.getStorageSync('userInfo');

    console.log('[App] 本地存储数据:', {
      hasToken: !!token,
      hasUserInfo: !!userInfo,
      userInfo: userInfo
    });

    if (token && userInfo) {
      this.globalData.token = token;
      this.globalData.userInfo = userInfo;
      this.globalData.isLogin = true;
      this.globalData.currentRole = userInfo.current_role || 'user';

      console.log('[App] 登录状态已恢复:', {
        isLogin: this.globalData.isLogin,
        currentRole: this.globalData.currentRole,
        userId: userInfo.id
      });

      // 验证token是否有效
      this.verifyToken();
    } else {
      console.log('[App] 未找到登录信息');
    }
  },

  /**
   * 验证token有效性
   */
  verifyToken() {
    console.log('[App] 开始验证Token有效性...');
    const verifyingToken = this.globalData.token;
    wx.request({
      url: `${this.globalData.baseUrl}/auth/verify-token`,
      method: 'GET',
      header: {
        'Authorization': `Bearer ${this.globalData.token}`
      },
      success: (res) => {
        // 旧会话的异步验证不能退出后来已登录的新会话。
        if (verifyingToken !== this.globalData.token) return;
        console.log('[App] Token验证响应:', res);
        // 只有明确的 401 或者 success=false 且 code=401 时才登出
        if (res.statusCode === 401 || (res.data && res.data.code === 401)) {
          console.warn('[App] Token已失效(401)，执行登出');
          this.logout();
        } else if (res.statusCode !== 200) {
          console.warn('[App] Token验证非200:', res.statusCode);
          // 这里可以选择不登出，或者根据业务决定
        }
      },
      fail: (err) => {
        console.error('[App] Token验证网络请求失败:', err);
        // 网络错误不应该登出，保持离线登录状态
      }
    });
  },

  /**
   * 获取位置权限
   */
  getLocationPermission() {
    wx.getSetting({
      success: (res) => {
        if (res.authSetting['scope.userLocation']) {
          // 已授权，获取位置
          this.getCurrentLocation();
        } else {
          // 未授权，引导用户授权
          wx.authorize({
            scope: 'scope.userLocation',
            success: () => {
              this.getCurrentLocation();
            },
            fail: () => {
              console.log('用户拒绝授权位置信息');
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
        this.globalData.location = {
          latitude: res.latitude,
          longitude: res.longitude
        };
        console.log('当前位置:', this.globalData.location);
      },
      fail: (err) => {
        console.error('获取位置失败:', err);
      }
    });
  },

  /**
   * 用户登录
   */
  login(userInfo, token) {
    console.log('开始保存登录信息:', { userInfo, token });

    this.globalData.userInfo = userInfo;
    this.globalData.token = token;
    this.globalData.isLogin = true;
    this.globalData.currentRole = userInfo.current_role || 'user';
    this.globalData.contentLoginEntry = null;

    // 存储到本地
    wx.setStorageSync('userInfo', userInfo);
    wx.setStorageSync('token', token);

    console.log('用户登录成功，全局数据已更新:', {
      userInfo: this.globalData.userInfo,
      token: this.globalData.token,
      isLogin: this.globalData.isLogin,
      currentRole: this.globalData.currentRole
    });
  },

  /**
   * 用户登出
   */
  logout(options = {}) {
    const pages = getCurrentPages();
    const current = pages[pages.length - 1];
    const contentEntry = options.entry === 'electrician-home' ||
      this.globalData.contentLoginEntry === 'electrician-home' ||
      (current && /^pages\/content\/(electrician-home|article-detail)\//.test(current.route));
    if (contentEntry) this.globalData.contentLoginEntry = 'electrician-home';
    this.globalData.userInfo = null;
    this.globalData.token = null;
    this.globalData.isLogin = false;
    this.globalData.currentRole = 'user';

    // 清除本地存储
    wx.removeStorageSync('userInfo');
    wx.removeStorageSync('token');

    console.log('用户登出');

    // verifyToken可能在首Page入栈前结束；只用精确启动路径临时保护公开页。
    const publicContent = current
      ? /^pages\/content\/(safety-knowledge|safety-knowledge-detail|notice-detail)\/index$/.test(current.route)
      : this._publicContentLaunchPending;
    if (current) this._publicContentLaunchPending = false;
    if (publicContent) return;

    if (contentEntry && current && current.route === 'pages/login/login') {
      if (current.enterElectricianHomeLogin) current.enterElectricianHomeLogin();
      return;
    }
    if (this._logoutNavigating) return;
    this._logoutNavigating = true;
    // 跳转到登录页
    wx.reLaunch({
      url: contentEntry ? '/pages/login/login?entry=electrician-home' : '/pages/login/login',
      complete: () => { this._logoutNavigating = false; }
    });
  },

  /**
   * 切换角色
   */
  switchRole(newRole) {
    if (this.globalData.userInfo) {
      this.globalData.userInfo.current_role = newRole;
      this.globalData.currentRole = newRole;

      // 更新本地存储
      wx.setStorageSync('userInfo', this.globalData.userInfo);

      console.log('角色切换成功:', newRole);
    }
  },

  /**
   * 显示加载提示
   */
  showLoading(title = '加载中...') {
    wx.showLoading({
      title: title,
      mask: true
    });
  },

  /**
   * 隐藏加载提示
   */
  hideLoading() {
    wx.hideLoading();
  },

  /**
   * 显示消息提示
   */
  showToast(title, icon = 'none', duration = 2000) {
    wx.showToast({
      title: title,
      icon: icon,
      duration: duration
    });
  },

  /**
   * 显示确认对话框
   */
  showModal(title, content) {
    return new Promise((resolve) => {
      wx.showModal({
        title: title,
        content: content,
        success: (res) => {
          resolve(res.confirm);
        },
        fail: () => {
          resolve(false);
        }
      });
    });
  },

  /**
   * 检查网络状态
   */
  checkNetworkStatus() {
    return new Promise((resolve) => {
      wx.getNetworkType({
        success: (res) => {
          if (res.networkType === 'none') {
            wx.showToast({
              title: '网络连接异常',
              icon: 'none'
            });
            resolve(false);
          } else {
            resolve(true);
          }
        },
        fail: () => {
          resolve(false);
        }
      });
    });
  },

  /**
   * 格式化日期
   */
  formatDate(date, format = 'YYYY-MM-DD HH:mm:ss') {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hour = String(d.getHours()).padStart(2, '0');
    const minute = String(d.getMinutes()).padStart(2, '0');
    const second = String(d.getSeconds()).padStart(2, '0');

    return format
      .replace('YYYY', year)
      .replace('MM', month)
      .replace('DD', day)
      .replace('HH', hour)
      .replace('mm', minute)
      .replace('ss', second);
  },

  /**
   * 计算距离
   */
  calculateDistance(lat1, lng1, lat2, lng2) {
    const radLat1 = lat1 * Math.PI / 180.0;
    const radLat2 = lat2 * Math.PI / 180.0;
    const a = radLat1 - radLat2;
    const b = lng1 * Math.PI / 180.0 - lng2 * Math.PI / 180.0;
    let s = 2 * Math.asin(Math.sqrt(Math.pow(Math.sin(a / 2), 2) +
      Math.cos(radLat1) * Math.cos(radLat2) * Math.pow(Math.sin(b / 2), 2)));
    s = s * 6378.137;
    s = Math.round(s * 10000) / 10000;
    return s * 1000; // 返回米
  },

  /**
   * 检查用户是否被冻结，如果是则跳转回个人中心
   * 返回 true 表示被冻结并已跳转，false 表示正常
   */
  checkFrozenAndRedirect() {
    const userInfo = this.globalData.userInfo;
    if (userInfo && userInfo.status === 'banned') {
      wx.showToast({
        title: '您的账户已冻结',
        icon: 'none',
        duration: 2000
      });
      setTimeout(() => {
        wx.switchTab({
          url: '/pages/profile/profile/profile'
        });
      }, 2000);
      return true;
    }
    return false;
  },
  
  /**
   * 更新全局用户状态（用于同步最新的冻结状态）
   */
  updateUserStatus(status) {
    if (this.globalData.userInfo) {
      this.globalData.userInfo.status = status;
      wx.setStorageSync('userInfo', this.globalData.userInfo);
    }
  }
});
