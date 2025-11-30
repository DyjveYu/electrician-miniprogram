// pages/message/list/list.js
const app = getApp();
const { MessageAPI } = require('../../../utils/api');

Page({
  data: {
    currentTab: 'order', // 当前选中的tab
    messages: [],
    loading: true,
    hasMore: true,
    page: 1,
    limit: 20,
    unreadCount: {
      order: 0,
      system: 0,
      total: 0
    }
  },

  onLoad(options) {
    this.loadUnreadCount();
    this.loadMessages();
  },

  onShow() {
    // 页面显示时刷新消息列表和未读数量
    this.loadUnreadCount();
    this.refreshMessages();
  },

  onPullDownRefresh() {
    this.refreshMessages();
  },

  onReachBottom() {
    this.loadMoreMessages();
  },

  /**
   * 切换tab
   */
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (tab === this.data.currentTab) return;
    
    this.setData({
      currentTab: tab,
      messages: [],
      page: 1,
      hasMore: true
    });
    
    this.loadMessages();
  },

  /**
   * 加载未读消息数量
   */
  async loadUnreadCount() {
    try {
      const result = await MessageAPI.getUnreadCount();
      console.log('未读数量API响应:', result);
      
      // 兼容不同的响应格式
      if (result.code === 0 || result.code === 200 || result.success) {
        const responseData = result.data || result;
        this.setData({
          unreadCount: responseData
        });
      }
    } catch (error) {
      console.error('获取未读消息数量失败:', error);
    }
  },

  // 刷新消息
  refreshMessages() {
    this.setData({
      messages: [],
      page: 1,
      hasMore: true
    });
    this.loadMessages();
    wx.stopPullDownRefresh();
  },

  /**
   * 加载消息列表
   */
  async loadMessages() {
    // 如果正在加载且不是第一页，则返回
    if (this.data.loading && this.data.page > 1) return;
    
    this.setData({ loading: true });
    
    try {
      const result = await MessageAPI.getMessageList({
        page: this.data.page,
        limit: this.data.limit,
        type: this.data.currentTab
      });
      
      // 兼容不同的响应格式
      if (result.code === 0 || result.code === 200 || result.success) {
        const responseData = result.data || result;
        const newMessages = responseData.messages || [];
        const hasMore = responseData.pagination?.hasMore || false;
        
        console.log('消息列表加载成功:', { newMessages, hasMore, currentTab: this.data.currentTab });
        
        this.setData({
          messages: this.data.page === 1 ? newMessages : [...this.data.messages, ...newMessages],
          hasMore,
          loading: false
        });
      } else {
        wx.showToast({
          title: result.message || '加载失败',
          icon: 'none'
        });
        this.setData({ loading: false });
      }
    } catch (error) {
      console.error('加载消息列表失败:', error);
      wx.showToast({
        title: '网络错误',
        icon: 'none'
      });
      this.setData({ loading: false });
    }
  },

  // 加载更多消息
  loadMoreMessages() {
    if (!this.data.hasMore || this.data.loading) return;
    
    this.setData({
      page: this.data.page + 1
    });
    this.loadMessages();
  },

  // 查看消息详情
  async viewMessageDetail(e) {
    const messageId = e.currentTarget.dataset.id;
    
    // 标记消息为已读
    try {
      await MessageAPI.markAsRead(messageId);
      // 更新本地消息状态
      const messages = this.data.messages.map(msg => {
        if (msg.id === messageId) {
          return { ...msg, is_read: 1 };
        }
        return msg;
      });
      this.setData({ messages });
      // 重新加载未读数量
      this.loadUnreadCount();
    } catch (error) {
      console.error('标记已读失败:', error);
    }
    
    wx.navigateTo({
      url: `/pages/message/detail/detail?id=${messageId}`
    });
  },

  /**
   * 格式化时间
   */
  formatTime(timeStr) {
    if (!timeStr) return '';
    
    const time = new Date(timeStr);
    const now = new Date();
    const diff = now - time;
    
    // 小于1分钟
    if (diff < 60 * 1000) {
      return '刚刚';
    }
    
    // 小于1小时
    if (diff < 60 * 60 * 1000) {
      return `${Math.floor(diff / (60 * 1000))}分钟前`;
    }
    
    // 小于1天
    if (diff < 24 * 60 * 60 * 1000) {
      return `${Math.floor(diff / (60 * 60 * 1000))}小时前`;
    }
    
    // 大于1天
    const year = time.getFullYear();
    const month = String(time.getMonth() + 1).padStart(2, '0');
    const day = String(time.getDate()).padStart(2, '0');
    const hour = String(time.getHours()).padStart(2, '0');
    const minute = String(time.getMinutes()).padStart(2, '0');
    
    if (year === now.getFullYear()) {
      return `${month}-${day} ${hour}:${minute}`;
    } else {
      return `${year}-${month}-${day} ${hour}:${minute}`;
    }
  }
});