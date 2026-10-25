const { ElectricianHomeAPI } = require('../../../utils/api');
const access = require('../../../utils/contentAccess');
Page({
  data: { article: null, loading: false, error: '', uncertain: false },
  onLoad(options) { this.articleId = options.id || ''; },
  onShow() {
    if (this._visible) return;
    this._visible = true;
    this.loadArticle();
  },
  onHide() { this.leave(); },
  onUnload() { this.leave(); },
  leave() {
    this._visible = false;
    this._sequence = (this._sequence || 0) + 1;
    this.setData({ article: null, loading: false, error: '' });
  },
  async loadArticle() {
    if (!this._visible || this.data.loading || !access.ensureAccess()) return;
    const sequence = this._sequence = (this._sequence || 0) + 1;
    this.setData({ loading: true, article: null, error: '', uncertain: false });
    try {
      const { data } = await ElectricianHomeAPI.detail(this.articleId);
      if (!this._visible || sequence !== this._sequence) return;
      const imageBaseUrl = getApp().globalData.imageBaseUrl;
      this.setData({ article: { ...data, date: access.formatArticleDate(data.published_at), body: data.body.map(block => block.type === 'image' ? { ...block, src: `${imageBaseUrl}${block.url}` } : block) } });
    } catch (error) {
      if (!this._visible || sequence !== this._sequence) return;
      if (!access.handleError(error)) this.setData({ error: error.message, uncertain: !error.statusCode || error.statusCode >= 500 });
    } finally {
      if (this._visible && sequence === this._sequence) this.setData({ loading: false });
    }
  },
  retry() {
    if (this.data.loading || this._retryPrompt) return;
    if (!this.data.uncertain) return this.loadArticle();
    this._retryPrompt = true;
    const sequence = this._sequence;
    wx.showModal({ title: '重新加载文章', content: '上次请求可能已计入阅读量。重试成功将再次计数。', success: result => {
      if (result.confirm && this._visible && sequence === this._sequence) this.loadArticle();
    }, complete: () => { this._retryPrompt = false; } });
  },
  goBack() { wx.navigateBack({ fail: () => wx.reLaunch({ url: '/pages/content/electrician-home/index' }) }); }
});
