// utils/api.js
// API请求工具类

const app = getApp();

class API {
  /**
   * 发起HTTP请求
   */
  static request(options) {
    return new Promise((resolve, reject) => {
      const {
        url,
        method = 'GET',
        data = {},
        header = {},
        showLoading = false,
        loadingText = '加载中...',
        showError = true
      } = options;

      // 显示加载提示
      if (showLoading) {
        app.showLoading(loadingText);
      }

      // 构建完整URL
      const fullUrl = url.startsWith('http') ? url : `${app.globalData.baseUrl}${url}`;

      // 设置请求头
      const requestHeader = {
        'Content-Type': 'application/json',
        ...header
      };

      // 添加认证token
      if (app.globalData.token) {
        requestHeader['Authorization'] = `Bearer ${app.globalData.token}`;
      }

      wx.request({
        url: fullUrl,
        method: method.toUpperCase(),
        data: data,
        header: requestHeader,
        success: (res) => {
          if (showLoading) {
            app.hideLoading();
          }

          if (res.statusCode === 200) {
            // 兼容后端返回的code格式：0表示成功，200也表示成功
            if (res.data.code === 0 || res.data.code === 200) {
              resolve(res.data);
            } else {
              const error = new Error(res.data.message || '请求失败');
              error.code = res.data.code;
              if (showError) {
                app.showToast(error.message);
              }
              reject(error);
            }
          } else if (res.statusCode === 401) {
            // token过期或无效
            app.logout();
            reject(new Error('登录已过期，请重新登录'));
          } else {
            const error = new Error(res.data?.message || `请求失败 (${res.statusCode})`);
            if (showError) {
              app.showToast(error.message);
            }
            reject(error);
          }
        },
        fail: (err) => {
          if (showLoading) {
            app.hideLoading();
          }
          
          const error = new Error('网络请求失败，请检查网络连接');
          if (showError) {
            app.showToast(error.message);
          }
          reject(error);
        }
      });
    });
  }

  /**
   * GET请求
   */
  static get(url, params = {}, options = {}) {
    const queryString = Object.keys(params)
      .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
      .join('&');
    
    const fullUrl = queryString ? `${url}?${queryString}` : url;
    
    return this.request({
      url: fullUrl,
      method: 'GET',
      ...options
    });
  }

  /**
   * POST请求
   */
  static post(url, data = {}, options = {}) {
    console.log(`API.post 调用: ${url}`, 'data:', data);
    return this.request({
      url,
      method: 'POST',
      data,
      ...options
    });
  }

  /**
   * PUT请求
   */
  static put(url, data = {}, options = {}) {
    return this.request({
      url,
      method: 'PUT',
      data,
      ...options
    });
  }

  /**
   * DELETE请求
   */
  static delete(url, options = {}) {
    return this.request({
      url,
      method: 'DELETE',
      ...options
    });
  }

  /**
   * 上传文件
   */
  static uploadFile(filePath, options = {}) {
    return new Promise((resolve, reject) => {
      const {
        url = '/system/upload',
        name = 'file',
        formData = {},
        showLoading = true,
        loadingText = '上传中...'
      } = options;

      if (showLoading) {
        app.showLoading(loadingText);
      }

      const fullUrl = url.startsWith('http') ? url : `${app.globalData.baseUrl}${url}`;

      wx.uploadFile({
        url: fullUrl,
        filePath: filePath,
        name: name,
        formData: formData,
        header: {
          'Authorization': `Bearer ${app.globalData.token}`
        },
        success: (res) => {
          if (showLoading) {
            app.hideLoading();
          }

          try {
            const data = JSON.parse(res.data);
            // 兼容后端返回的code格式：0表示成功，200也表示成功
            if (data.code === 0 || data.code === 200) {
              resolve(data);
            } else {
              app.showToast(data.message || '上传失败');
              reject(new Error(data.message || '上传失败'));
            }
          } catch (e) {
            app.showToast('上传失败');
            reject(new Error('上传失败'));
          }
        },
        fail: (err) => {
          if (showLoading) {
            app.hideLoading();
          }
          app.showToast('上传失败');
          reject(err);
        }
      });
    });
  }
}

// 认证相关API
class AuthAPI {
  /**
   * 发送验证码
   */
  static sendCode(phone, type = 'login') {
    return API.post('/auth/send-code', { phone, type });
  }

  /**
   * 微信 code2session
   */
  static code2Session(code) {
    return API.post('/auth/code2session', { code });
  }

  /**
   * 用户登录
   */
  static login(phone, code, initialRole = 'user', openid = null) {
    console.log('AuthAPI.login 调用参数:', { phone, code, initialRole, openid });
    return API.post('/auth/login', { phone, code, initialRole, openid });
  }

  /**
   * 获取用户信息
   */
  static getUserInfo() {
    return API.get('/auth/userinfo');
  }

  /**
   * 更新用户信息
   */
  static updateProfile(data) {
    return API.put('/auth/profile', data);
  }

  /**
   * 切换角色
   */
  static switchRole(role) {
    return API.post('/auth/switch-role', { role });
  }

  /**
   * 刷新token
   */
  static refreshToken() {
    return API.post('/auth/refresh-token');
  }

  /**
   * 用户登出
   */
  static logout() {
    return API.post('/auth/logout');
  }
}

// 工单相关API
class OrderAPI {
  /**
   * 创建工单
   */
  static createOrder(data) {
    return API.post('/orders', data, { showLoading: true, loadingText: '创建中...' });
  }

  /**
   * 获取工单列表
   */
  static getOrderList(params = {}) {
    return API.get('/orders', params);
  }

  /**
   * 获取工单详情
   */
  static getOrderDetail(id) {
    return API.get(`/orders/${id}`);
  }

  /**
   * 电工抢单
   */
  static takeOrder(id) {
    return API.post(`/orders/${id}/take`, {}, {
      showLoading: true,
      loadingText: '接单中...'
    });
  }

  /**
   * 确认工单
   */
  static confirmOrder(id) {
    return API.post(`/orders/${id}/confirm`, {}, {
      showLoading: true,
      loadingText: '确认中...'
    });
  }

  /**
   * 开始服务
   */
  static startService(id) {
    return API.post(`/orders/${id}/start`, {}, {
      showLoading: true,
      loadingText: '开始服务...'
    });
  }

  /**
   * 完成服务
   */
  static completeService(id, data = {}) {
    return API.post(`/orders/${id}/complete`, data, {
      showLoading: true,
      loadingText: '完成服务...'
    });
  }

  /**
   * 取消工单
   */
  static cancelOrder(id, reason = '') {
    return API.post(`/orders/${id}/cancel`, { reason }, {
      showLoading: true,
      loadingText: '取消中...'
    });
  }

  /**
   * 获取工单统计
   */
  static getOrderStats() {
    return API.get('/orders/stats/summary');
  }
}

// 支付相关API
class PaymentAPI {
  /**
   * 创建支付
   */
  static createPayment(data) {
    return API.post('/payments', data, {
      showLoading: true,
      loadingText: '创建支付...'
    });
  }

  /**
   * 测试支付确认
   */
  static confirmTestPayment(paymentNo) {
    return API.post('/payments/test/confirm', { payment_no: paymentNo }, {
      showLoading: true,
      loadingText: '支付中...'
    });
  }

  /**
   * 查询支付状态
   */
  static queryPayment(paymentNo) {
    return API.get(`/payments/${paymentNo}`);
  }

  /**
   * 获取支付列表
   */
  static getPaymentList(params = {}) {
    return API.get('/payments', params);
  }

  /**
   * 申请退款
   */
  static requestRefund(paymentNo, reason = '') {
    return API.post(`/payments/${paymentNo}/refund`, { reason }, {
      showLoading: true,
      loadingText: '申请退款...'
    });
  }
}

// 系统相关API
class SystemAPI {
  /**
   * 获取服务类型列表
   */
  static getServiceTypes() {
    return API.get('/system/service-types');
  }

  /**
   * 获取应用信息
   */
  static getAppInfo() {
    return API.get('/system/app-info');
  }

  /**
   * 获取附近电工
   */
  static getNearbyElectricians(latitude, longitude, distance = 1000) {
    return API.get('/system/nearby-electricians', {
      latitude,
      longitude,
      distance
    });
  }

  /**
   * 搜索
   */
  static search(keyword, type = 'all') {
    return API.get('/system/search', { keyword, type });
  }

  /**
   * 获取平台统计
   */
  static getPlatformStats() {
    return API.get('/system/stats');
  }

  /**
   * 上传文件
   */
  static uploadFile(filePath) {
    return API.uploadFile(filePath);
  }
}

// 消息相关API
class MessageAPI {
  /**
   * 获取消息列表
   */
  static getMessageList(params = {}) {
    return API.get('/messages', params);
  }

  /**
   * 获取消息详情
   */
  static getMessageDetail(id) {
    return API.get(`/messages/${id}`);
  }

  /**
   * 标记消息为已读
   */
  static markAsRead(id) {
    return API.put(`/messages/${id}/read`);
  }

  /**
   * 获取未读消息数量
   */
  static getUnreadCount() {
    return API.get('/messages/unread/count');
  }
}

module.exports = {
  API,
  AuthAPI,
  OrderAPI,
  PaymentAPI,
  SystemAPI,
  MessageAPI
};