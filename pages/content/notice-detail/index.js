const { ContentAPI } = require('../../../utils/api');
Page({
  data: { notice: null, loading: true, error: '' },
  onLoad(options) { this.noticeId = options.id; this.loadNotice(); },
  onShow() { if (this.data.notice) this.loadNotice(); },
  async loadNotice() {
    this.setData({ loading: true, notice: null, error: '' });
    try {
      const { data } = await ContentAPI.getNotice(this.noticeId || '');
      this.setData({ notice: data });
    } catch (error) { this.setData({ error: error.message }); }
    finally { this.setData({ loading: false }); }
  },
  goBack() { wx.navigateBack({ fail: () => wx.reLaunch({ url: '/pages/login/login' }) }); }
});
