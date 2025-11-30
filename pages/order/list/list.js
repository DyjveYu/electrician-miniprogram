// pages/order/list/list.js
const { getDisplayStatusText, mapOrderToDisplayStatus } = require('../../../utils/util');
Page({
  data: {
    // 单一“我的订单”Tab
    currentTab: 0,
    tabs: [
      { name: '我的订单', status: 'all' }
    ],
    orders: [],
    loading: false,
    hasMore: true,
    page: 1,
    pageSize: 10
  },

  onLoad(options) {
    // 如果从其他页面传入tab参数
    if (options.tab) {
      const tabIndex = parseInt(options.tab);
      if (tabIndex >= 0 && tabIndex < this.data.tabs.length) {
        this.setData({ currentTab: tabIndex });
      }
    }
    this.loadOrders();
  },

  onShow() {
    // 页面显示时刷新数据
    this.refreshOrders();
  },

  onPullDownRefresh() {
    this.refreshOrders();
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadMoreOrders();
    }
  },

  // 切换Tab（当前仅一个Tab，预留兼容）
  switchTab(e) {
    const index = e.currentTarget.dataset.index;
    if (index !== this.data.currentTab) {
      this.setData({ currentTab: index });
    }
  },

  // 刷新订单列表
  refreshOrders() {
    this.setData({
      orders: [],
      page: 1,
      hasMore: true
    });
    this.loadOrders();
  },

  // 加载订单列表
  loadOrders() {
    if (this.data.loading) return;
    
    this.setData({ loading: true });
    
    const app = getApp();
    
    wx.request({
      url: `${app.globalData.baseUrl}/orders`,
      method: 'GET',
      header: {
        'Authorization': `Bearer ${app.globalData.token}`
      },
      data: {
        // 统一为“我的订单”：用户查看自己的订单；电工查看自己接的订单
        my_orders: true,
        page: this.data.page,
        limit: this.data.pageSize
      },
      success: (res) => {
        wx.stopPullDownRefresh();
        this.setData({ loading: false });
        
        if (res.data.code === 0 || res.data.code === 200) {
          const newOrders = res.data.data.list || [];
          const normalizedOrders = newOrders.map(o => {
            const display = mapOrderToDisplayStatus(o);
            
            // 字段映射和格式化
            return {
              ...o,
              statusText: display.text,
              displayStatus: display.code,
              orderNumber: o.orderNumber || o.order_no,
              createTime: this.formatOrderTime(o.createTime || o.created_at),
              serviceTypeName: o.title || o.serviceTypeName || (o.serviceType && o.serviceType.name) || '未知服务',
              // 计算操作权限
              ...this.computeActionFlags(o)
            };
          });
          const getUpdatedAt = item => item.updated_at || item.updatedAt || item.updateTime || item.updated_at || item.createTime || item.created_at || 0;
          const merged = (this.data.page === 1 ? normalizedOrders : this.data.orders.concat(normalizedOrders))
            .sort((a, b) => new Date(getUpdatedAt(b)).getTime() - new Date(getUpdatedAt(a)).getTime());
          this.setData({
            orders: merged,
            hasMore: normalizedOrders.length === this.data.pageSize
          });
        } else {
          wx.showToast({ title: res.data.message || '加载失败', icon: 'none' });
        }
      },
      fail: () => {
        wx.stopPullDownRefresh();
        this.setData({ loading: false });
        wx.showToast({ title: '网络错误，请重试', icon: 'none' });
      }
    });
  },

  // 加载更多订单
  loadMoreOrders() {
    this.setData({ page: this.data.page + 1 });
    this.loadOrders();
  },

  // 查看订单详情
  viewOrderDetail(e) {
    const orderId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/order/detail/detail?id=${orderId}`
    });
  },

  // 取消订单
  cancelOrder(e) {
    const orderId = e.currentTarget.dataset.id;
    const that = this;
    
    wx.showModal({
      title: '确认取消',
      content: '确定要取消这个订单吗？',
      success(res) {
        if (res.confirm) {
          that.performCancelOrder(orderId);
        }
      }
    });
  },

  // 执行取消订单
  performCancelOrder(orderId) {
    const app = getApp();
    
    wx.request({
      url: `${app.globalData.baseUrl}/orders/${orderId}/cancel`,
      method: 'POST',
      header: {
        'Authorization': `Bearer ${app.globalData.token}`
      },
      success: (res) => {
        if (res.data.code === 0) {
          wx.showToast({ title: '订单已取消', icon: 'success' });
          this.refreshOrders();
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
  acceptOrder(e) {
    const orderId = e.currentTarget.dataset.id;
    const app = getApp();
    
    wx.request({
      url: `${app.globalData.baseUrl}/orders/${orderId}/take`,
      method: 'POST',
      header: {
        'Authorization': `Bearer ${app.globalData.token}`
      },
      success: (res) => {
        if (res.data.code === 0) {
          wx.showToast({ title: '接单成功', icon: 'success' });
          this.refreshOrders();
        } else {
          wx.showToast({ title: res.data.message || '接单失败', icon: 'none' });
        }
      },
      fail: () => {
        wx.showToast({ title: '网络错误，请重试', icon: 'none' });
      }
    });
  },

  // 完成订单（电工）
  completeOrder(e) {
    const orderId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/order/detail/detail?id=${orderId}&action=complete`
    });
  },

  // 去支付（用户）
  goToPay(e) {
    const orderId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/payment/payment?orderId=${orderId}`
    });
  },

  // 联系对方
  contactUser(e) {
    const phone = e.currentTarget.dataset.phone;
    wx.makePhoneCall({
      phoneNumber: phone
    });
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

  // 计算操作权限
  computeActionFlags(order) {
    const app = getApp();
    const currentRole = app.globalData.currentRole || 'user';
    const status = order.status;
    
    return {
      canCancel: (currentRole === 'user' && (status === 'pending' || status === 'in_progress')),
      canAccept: (currentRole === 'electrician' && status === 'pending'),
      canComplete: (currentRole === 'electrician' && status === 'in_progress'),
      canPay: (currentRole === 'user' && status === 'completed' && !order.has_paid_repair),
      canReview: (currentRole === 'user' && status === 'completed' && !order.has_review)
    };
  },

  // 格式化相对时间（保留原方法，可能其他地方用到）
  formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) {
      return '刚刚';
    } else if (diff < 3600000) {
      return Math.floor(diff / 60000) + '分钟前';
    } else if (diff < 86400000) {
      return Math.floor(diff / 3600000) + '小时前';
    } else {
      return date.toLocaleDateString();
    }
  }
});