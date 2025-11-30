// pages/message/detail/detail.js
const { MessageAPI } = require('../../../utils/api');

Page({
  data: {
    messageId: '',
    message: null,
    loading: true
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ messageId: options.id });
      this.loadMessageDetail();
    }
  },

  async loadMessageDetail() {
    this.setData({ loading: true });
    try {
      const result = await MessageAPI.getMessageDetail(this.data.messageId);
      if (result.code === 0 || result.code === 200 || result.success) {
        const message = result.data || result;
        message.createTime = message.createTime || message.published_at || message.created_at || '';
        this.setData({ message });
        await this.markAsRead();
      } else {
        wx.showToast({
          title: result.message || '加载失败',
          icon: 'none'
        });
      }
    } catch (error) {
      console.error('加载消息详情失败:', error);
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  async markAsRead() {
    if (!this.data.messageId) {
      return;
    }
    try {
      await MessageAPI.markAsRead(this.data.messageId);
    } catch (error) {
      console.error('标记已读失败:', error);
    }
  },

  viewOrder(e) {
    const orderId = e.currentTarget.dataset.id || this.data.message?.orderId || this.data.message?.related_id;
    if (!orderId) {
      return;
    }
    wx.navigateTo({
      url: `/pages/order/detail/detail?id=${orderId}`
    });
  }
});