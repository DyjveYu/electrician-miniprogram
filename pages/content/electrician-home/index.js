const { ElectricianHomeAPI } = require('../../../utils/api');
const access = require('../../../utils/contentAccess');
Page({
  data: { list: [], page: 1, pages: 0, total: 0, loading: false, error: '' },
  onShow() {
    if (this._visible) return;
    this._visible = true;
    this._opening = false;
    this.loadPage(this.data.page);
  },
  onHide() { this.leave(); },
  onUnload() { this.leave(); },
  leave() {
    this._visible = false;
    this._sequence = (this._sequence || 0) + 1;
    this.setData({ list: [], loading: false });
  },
  async loadPage(page) {
    if (!this._visible || this.data.loading || !access.ensureAccess()) return;
    const sequence = this._sequence = (this._sequence || 0) + 1;
    this.setData({ loading: true, error: '', list: [] });
    try {
      const { data } = await ElectricianHomeAPI.list(page);
      if (!this._visible || sequence !== this._sequence) return;
      // 删除/下架可能缩短末页，回到仍存在的页；每次只保留一页。
      if (page > 1 && !data.list.length) {
        this.setData({ loading: false });
        return this.loadPage(Math.max(1, data.pages));
      }
      this.setData({ list: data.list.map(item => ({ ...item, date: access.formatArticleDate(item.published_at) })), page: data.page, pages: data.pages, total: data.total });
    } catch (error) {
      if (!this._visible || sequence !== this._sequence) return;
      if (!access.handleError(error)) this.setData({ error: error.message });
    } finally {
      if (this._visible && sequence === this._sequence) this.setData({ loading: false });
    }
  },
  retry() { this.loadPage(this.data.page); },
  previous() { if (this.data.page > 1) this.loadPage(this.data.page - 1); },
  next() { if (this.data.page < this.data.pages) this.loadPage(this.data.page + 1); },
  openArticle(event) {
    if (this._opening || !access.ensureAccess()) return;
    this._opening = true;
    wx.navigateTo({ url: `/pages/content/article-detail/index?id=${encodeURIComponent(event.currentTarget.dataset.id)}`, fail: () => { this._opening = false; } });
  }
});
