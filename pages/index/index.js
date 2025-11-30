// pages/index/index.js
const app = getApp();
const { SystemAPI, OrderAPI, AuthAPI } = require('../../utils/api');
const { formatTime, formatDistance, getOrderStatusText } = require('../../utils/util');

Page({
  data: {
    userInfo: null,
    currentRole: 'user', // 当前用户角色
    locationText: '北京市朝阳区',
    latitude: null,
    longitude: null,
    // 用户角色的最近订单
    recentOrders: [
      {
        id: 1,
        title: '客厅灯具安装',
        status: 'completed',
        statusText: '已完成',
        electrician_name: '张师傅',
        created_at: '2024-01-15 14:30',
        createdTime: '2024-01-15 14:30',
        rating: 5,
        final_price: 120
      },
      {
        id: 2,
        title: '厨房插座维修',
        status: 'completed',
        statusText: '已完成',
        electrician_name: '李师傅',
        created_at: '2024-01-12 09:15',
        createdTime: '2024-01-12 09:15',
        rating: 4.8,
        final_price: 80
      },
      {
        id: 3,
        title: '卫生间照明修理',
        status: 'completed',
        statusText: '已完成',
        electrician_name: '王师傅',
        created_at: '2024-01-10 16:20',
        createdTime: '2024-01-10 16:20',
        rating: 4.9,
        final_price: 95
      }
    ],
    // 电工角色的附近订单
    nearbyOrders: [],
    loading: false
  },

  onLoad() {
    console.log('首页加载');
    this.initPage();
  },

  onShow() {
    console.log('首页显示');
    this.initPage();
  },

  onPullDownRefresh() {
    this.loadData().finally(() => {
      wx.stopPullDownRefresh();
    });
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
      await this.loadNearbyOrders();
    } else {
      await this.loadRecentOrders();
    }
  },

  /**
   * 加载附近订单（电工角色）
   */
  async loadNearbyOrders() {
    try {
      console.log('[DEBUG] 开始加载附近订单...');
      this.setData({ loading: true });
      
      const params = {
        page: 1,
        limit: 20,
        my_orders: false, // 获取可接的订单
        status: 'pending' // 只获取待接单的订单
      };
      
      console.log('[DEBUG] 请求参数:', params);
      
      // 暂时移除地理位置参数，避免后端查询错误
      // TODO: 后续实现完整的地理位置筛选功能
      
      const response = await OrderAPI.getOrderList(params);
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
        
        const formattedOrders = orders.map(order => {
          console.log('[DEBUG] 处理订单:', order.id, order.title);
          const normalizedStatus = order.status === 'confirmed' ? 'in_progress' : order.status;
          return {
            ...order,
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
      console.error('[DEBUG] 加载附近订单失败:', error);
      wx.showToast({
        title: '加载订单失败',
        icon: 'none'
      });
    } finally {
      this.setData({ loading: false });
      console.log('[DEBUG] 加载附近订单完成');
    }
  },

  /**
   * 加载最近订单（用户角色）
   */
  async loadRecentOrders() {
    try {
      console.log('[DEBUG] 开始加载最近订单...');
      this.setData({ loading: true });
      
      const params = {
        page: 1,
        limit: 5,
        my_orders: true,
        status: 'completed'
      };
      
      console.log('[DEBUG] 请求参数:', params);
      
      const response = await OrderAPI.getOrderList(params);
      console.log('[DEBUG] API响应:', response);
      
      if (response.code === 200) {
        // 统一数据结构处理：优先使用list字段，兼容orders字段
        let orders = response.data.list || response.data.orders || [];
        console.log('[DEBUG] 解析到的订单数据:', orders);
        console.log('[DEBUG] 订单数量:', orders.length);

        // 仅保留已完成订单，并按时间倒序
        orders = orders.filter(o => o.status === 'completed')
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        if (orders.length === 0) {
          console.log('[DEBUG] 没有找到最近订单，使用模拟数据');
          // 保持使用模拟数据
          return;
        }
        
        const formattedOrders = orders.map(order => {
          console.log('[DEBUG] 处理订单:', order.id, order.title);
          return {
            ...order,
            statusText: getOrderStatusText(order.status),
            createdTime: formatTime(order.created_at)
          };
        });
        
        console.log('[DEBUG] 格式化后的订单:', formattedOrders);
        
        this.setData({
          recentOrders: formattedOrders
        });
        
        console.log('[DEBUG] 最近订单数据已设置到页面');
      } else {
        console.error('[DEBUG] API返回错误:', response.message);
        console.log('[DEBUG] 保持使用模拟数据');
        // 保持使用模拟数据
      }
    } catch (error) {
      console.error('[DEBUG] 加载最近订单失败:', error);
      console.log('[DEBUG] 保持使用模拟数据');
      // 保持使用模拟数据
    } finally {
      this.setData({ loading: false });
      console.log('[DEBUG] 加载最近订单完成');
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
    if (this.data.currentRole !== 'user') {
      wx.showToast({
        title: '请切换到用户身份',
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
    wx.navigateTo({
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
    
    if (this.data.currentRole !== 'electrician') {
      wx.showToast({
        title: '请切换到电工身份',
        icon: 'none'
      });
      return;
    }
    
    // 跳转到订单详情页，在详情页进行接单确认
    wx.navigateTo({
      url: `/pages/order/detail/detail?id=${orderId}&action=take`
    });
  },

  

  /**
   * 刷新订单列表
   */
  refreshOrders() {
    this.loadData();
  }
});