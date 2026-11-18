const flow = require('../../../utils/offsiteOrder');
const personal = require('../../../utils/personalOrder');
Page({
  data: { orders: [], page: 0, hasMore: true, loading: false, error: '' },
  onLoad() { this._visible = true; this.load(true); },
  onShow() { if (this._hidden) { this._visible = true; this._hidden = false; this.load(true); } },
  onHide() { this._visible = false; this._hidden = true; this._version = (this._version || 0) + 1; this.setData({ loading: false }); },
  onUnload() { this._visible = false; this._version = (this._version || 0) + 1; },
  onPullDownRefresh() { this.load(true); },
  onReachBottom() { if (this.data.hasMore) this.load(false); },
  async load(reset = false) {
    if (this.data.loading || this._visible === false) return;
    if (getApp().globalData.userInfo?.current_role !== 'electrician') { this.setData({ orders: [], error: '请以电工身份登录' }); return; }
    const version = this._version = (this._version || 0) + 1, page = reset ? 1 : this.data.page + 1;
    this.setData({ loading: true, error: '' });
    try {
      const result = await flow.request('GET', '/orders', { my_orders: false, order_scope: 'nationwide', page, limit: 20 });
      if (version !== this._version || this._visible === false) return;
      if (!Array.isArray(result.data?.list) || !Number.isFinite(Number(result.data.pages))) throw new Error('全国订单响应未确认，请重试');
      const rows = result.data.list.map(order => ({ ...order, ...personal.labels(order) }));
      this.setData({ orders: reset ? rows : [...this.data.orders, ...rows], page, hasMore: page < result.data.pages });
    } catch (error) { if (version === this._version && !error.stale) this.setData({ error: error.message || '全国订单读取失败，请重试' }); }
    finally { if (version === this._version) this.setData({ loading: false }); wx.stopPullDownRefresh(); }
  },
  retry() { this.load(true); },
  view(e) { wx.navigateTo({ url: `/pages/order/detail/detail?id=${e.currentTarget.dataset.id}` }); }
});
