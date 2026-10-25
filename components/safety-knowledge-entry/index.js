Component({
  pageLifetimes: { show() { this._opening = false; } },
  methods: {
    openKnowledge() {
      if (this._opening) return;
      this._opening = true;
      wx.navigateTo({ url: '/pages/content/safety-knowledge/index', fail: () => {
        this._opening = false;
        wx.showToast({ title: '页面打开失败，请重试', icon: 'none' });
      } });
    }
  }
});
