const { ContentAPI } = require('../../utils/api');
Component({
  data: { group: [], nextGroup: [], transitioning: false, loading: false, error: '' },
  lifetimes: {
    attached() { this.showBoard(); },
    detached() { this.hideBoard(); }
  },
  pageLifetimes: {
    show() { this.showBoard(); },
    hide() { this.hideBoard(); }
  },
  methods: {
    showBoard() {
      if (this._visible) return;
      this._visible = true;
      this._opening = false;
      this._items = [];
      this._index = 0;
      this.setData({ group: [], nextGroup: [], transitioning: false, error: '' });
      this.loadPage(1);
    },
    hideBoard() {
      this._visible = false;
      this._generation = (this._generation || 0) + 1;
      this.clearTimer();
      if (this._task && this._task.abort) this._task.abort();
      this._task = null;
      this._pending = false;
      this._items = [];
      this.setData({ group: [], nextGroup: [], transitioning: false, loading: false, error: '' });
    },
    clearTimer() {
      if (this._timer !== undefined) clearTimeout(this._timer);
      this._timer = undefined;
    },
    schedule() {
      if (this.data.transitioning) return;
      this.clearTimer();
      if (!this._visible || this.data.error || !this._items.length || (this._items.length <= 3 && !this._hasMore && this._pageNo === 1)) return;
      const generation = this._generation;
      this._timer = setTimeout(() => {
        if (!this._visible || generation !== this._generation) return;
        this._timer = undefined;
        this.advance();
      }, 5000);
    },
    showGroup(group) {
      this.clearTimer();
      if (!this.data.group.length || !group.length) {
        this.setData({ group, nextGroup: [], transitioning: false });
        return;
      }
      const generation = this._generation;
      this.setData({ nextGroup: group, transitioning: true });
      this._timer = setTimeout(() => {
        if (!this._visible || generation !== this._generation) return;
        this._timer = undefined;
        this.setData({ group, nextGroup: [], transitioning: false });
        this.schedule();
      }, 300);
    },
    async loadPage(page) {
      if (!this._visible || this._pending || this.data.transitioning) return;
      this.clearTimer();
      const generation = this._generation = (this._generation || 0) + 1;
      this._pending = true;
      this._retryPage = page;
      this.setData({ loading: true, error: '' });
      let reset = false;
      try {
        const { data } = await ContentAPI.getNotices({ page, pageSize: 30 }, { onRequestTask: task => { this._task = task; } });
        if (!this._visible || generation !== this._generation) return;
        this._items = data.notices.slice(0, 30);
        this._pageNo = page;
        this._hasMore = data.pagination.hasMore;
        this._index = 0;
        this._retryPage = null;
        this.showGroup(this._items.slice(0, 3));
        reset = page > 1 && this._items.length === 0;
      } catch (error) {
        if (!this._visible || generation !== this._generation) return;
        this.setData({ error: error.message || '通知加载失败，请重试' });
      } finally {
        if (this._visible && generation === this._generation) {
          this._pending = false;
          this._task = null;
          this.setData({ loading: false });
          if (reset) this.loadPage(1);
          else this.schedule();
        }
      }
    },
    advance() {
      if (!this._visible || this._pending || this.data.transitioning || this.data.error) return;
      if (this._index + 3 < this._items.length) {
        this._index += 3;
        this.showGroup(this._items.slice(this._index, this._index + 3));
        this.schedule();
      } else this.loadPage(this._hasMore ? this._pageNo + 1 : 1);
    },
    retry() { this.loadPage(this._retryPage || 1); },
    openNotice(event) {
      if (!this._visible || this._opening || this.data.transitioning) return;
      const id = event.currentTarget.dataset.id;
      if (!this.data.group.some(item => String(item.id) === String(id))) return;
      this._opening = true;
      wx.navigateTo({ url: `/pages/content/notice-detail/index?id=${encodeURIComponent(id)}`,
        fail: () => { this._opening = false; wx.showToast({ title: '页面打开失败，请重试', icon: 'none' }); } });
    }
  }
});
