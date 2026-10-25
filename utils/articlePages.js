const { formatArticleDate } = require('./contentAccess');
const publicAccess = { ensureAccess: () => true, handleError: () => false };
function shown(isPublic) {
  if (isPublic) getApp()._publicContentLaunchPending = false;
}

function listPage({ api, detailPath, access = publicAccess, isPublic = false }) {
  return {
    data: { list: [], page: 1, pages: 0, total: 0, loading: false, error: '' },
    onShow() {
      shown(isPublic);
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
        const { data } = await api.list(page);
        if (!this._visible || sequence !== this._sequence) return;
        if (page > 1 && !data.list.length) {
          this.setData({ loading: false });
          return this.loadPage(Math.max(1, data.pages));
        }
        this.setData({ list: data.list.map(item => ({ ...item, date: formatArticleDate(item.published_at) })), page: data.page, pages: data.pages, total: data.total });
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
      if (!this._visible || this._opening || !access.ensureAccess()) return;
      this._opening = true;
      wx.navigateTo({ url: `${detailPath}?id=${encodeURIComponent(event.currentTarget.dataset.id)}`, fail: () => { this._opening = false; } });
    }
  };
}

function detailPage({ api, listPath, access = publicAccess, isPublic = false }) {
  return {
    data: { article: null, loading: false, error: '', uncertain: false },
    onLoad(options) { this.articleId = options.id || ''; },
    onShow() {
      shown(isPublic);
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
        const { data } = await api.detail(this.articleId);
        if (!this._visible || sequence !== this._sequence) return;
        const imageBaseUrl = getApp().globalData.imageBaseUrl;
        this.setData({ article: { ...data, date: formatArticleDate(data.published_at), body: data.body.map(block => block.type === 'image' ? { ...block, src: `${imageBaseUrl}${block.url}` } : block) } });
      } catch (error) {
        if (!this._visible || sequence !== this._sequence) return;
        if (!access.handleError(error)) this.setData({ error: error.message, uncertain: !error.statusCode || error.statusCode >= 500 });
      } finally {
        if (this._visible && sequence === this._sequence) this.setData({ loading: false });
      }
    },
    retry() {
      if (!this._visible || this.data.loading || this._retryPrompt) return;
      if (!this.data.uncertain) return this.loadArticle();
      this._retryPrompt = true;
      const sequence = this._sequence;
      wx.showModal({ title: '重新加载文章', content: '上次请求可能已计入阅读量。重试成功将再次计数。', success: result => {
        if (result.confirm && this._visible && sequence === this._sequence) this.loadArticle();
      }, complete: () => { this._retryPrompt = false; } });
    },
    goBack() { wx.navigateBack({ fail: () => wx.reLaunch({ url: listPath }) }); }
  };
}
module.exports = { listPage, detailPage };
