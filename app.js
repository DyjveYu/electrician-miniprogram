// app.js
App({
  globalData: {
    userInfo: null,
    token: null,
    baseUrl: 'https://www.mijutime.com/api', // 阿里云 开发环境API地址
    // baseUrl: 'http://localhost:3000/api', // 本地开发环境API地址
    isLogin: false,
    currentRole: 'user', // user | electrician
    systemInfo: null,
    location: null,
    // 支付方式全局配置：生产默认微信支付wechat；开发可自动走测试支付test
    paymentMethod: 'wechat'
  },

  onLaunch() {
    console.log('小程序启动');
    
    // 获取系统信息
    this.getSystemInfo();
    
    // 检查登录状态
    this.checkLoginStatus();
    // 位置权限不在启动阶段申请，避免重复弹窗；在真正需要定位的页面再调用
  },

  onShow() {
    console.log('小程序显示');
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
    const token = wx.getStorageSync('token');
    const userInfo = wx.getStorageSync('userInfo');
    
    if (token && userInfo) {
      this.globalData.token = token;
      this.globalData.userInfo = userInfo;
      this.globalData.isLogin = true;
      this.globalData.currentRole = userInfo.current_role || 'user';
      
      // 验证token是否有效
      this.verifyToken();
    }
  },

  /**
   * 验证token有效性
   */
  verifyToken() {
    wx.request({
      url: `${this.globalData.baseUrl}/auth/verify-token`,
      method: 'GET',
      header: {
        'Authorization': `Bearer ${this.globalData.token}`
      },
      success: (res) => {
        if (res.statusCode !== 200 || !res.data.success) {
          // token无效，清除登录状态
          this.logout();
        }
      },
      fail: () => {
        // 网络错误，暂不处理
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
  logout() {
    this.globalData.userInfo = null;
    this.globalData.token = null;
    this.globalData.isLogin = false;
    this.globalData.currentRole = 'user';
    
    // 清除本地存储
    wx.removeStorageSync('userInfo');
    wx.removeStorageSync('token');
    
    console.log('用户登出');
    
    // 跳转到登录页
    wx.reLaunch({
      url: '/pages/login/login'
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
  }
});