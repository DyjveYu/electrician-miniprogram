const { ContentAPI } = require('../../../utils/api');
const { formatArticleDate } = require('../../../utils/contentAccess');
Page({
  data: { notice: null, loading: false, error: '' },
  onLoad(options) { this.noticeId = options.id || ''; },
  onShow() {
    getApp()._publicContentLaunchPending = false;
    if (this._visible) return;
    this._visible = true;
    this.loadNotice();
  },
  onHide() { this.leave(); },
  onUnload() { this.leave(); },
  leave() {
    this._visible = false;
    this._generation = (this._generation || 0) + 1;
    if (this._task && this._task.abort) this._task.abort();
    this._task = null;
    this.setData({ notice: null, loading: false, error: '' });
  },
  async loadNotice() {
    if (!this._visible || this.data.loading) return;
    const generation = this._generation = (this._generation || 0) + 1;
    this.setData({ loading: true, notice: null, error: '' });
    try {
      const { data } = await ContentAPI.getNotice(this.noticeId, { onRequestTask: task => { this._task = task; } });
      if (this._visible && generation === this._generation) this.setData({ notice: { ...data, date: formatArticleDate(data.published_at) } });
    } catch (error) {
      if (this._visible && generation === this._generation) this.setData({ error: error.message });
    } finally {
      if (this._visible && generation === this._generation) { this._task = null; this.setData({ loading: false }); }
    }
  },
  goBack() { wx.navigateBack({ fail: () => wx.reLaunch({ url: '/pages/login/login' }) }); }
});
