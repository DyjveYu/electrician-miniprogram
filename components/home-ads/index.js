const { ContentAPI } = require('../../utils/api');
Component({
  data: { icons: [], banner: null, error: '', loading: false },
  lifetimes: { attached() { this.loadAds(); } },
  pageLifetimes: { show() { this.loadAds(); } },
  methods: {
    async loadAds() {
      if (this.data.loading) return;
      this.setData({ loading: true });
      try {
        const { data } = await ContentAPI.getAds();
        const imageBaseUrl = getApp().globalData.imageBaseUrl;
        const ads = data.map(ad => ({ ...ad, image: `${imageBaseUrl}${ad.image_url}` }));
        this.setData({ icons: ads.filter(ad => /^icon_[1-4]$/.test(ad.slot_key)),
          banner: ads.find(ad => ad.slot_key === 'banner') || null, error: '' });
      } catch (error) { this.setData({ error: '广告加载失败，点击重试' }); }
      finally { this.setData({ loading: false }); }
    },
    async openAd(event) {
      if (this.opening) return;
      this.opening = true;
      try {
        const slot = event.currentTarget.dataset.slot;
        const { data } = await ContentAPI.resolveTarget(slot);
        const url = data.type === 'notice'
          ? `/pages/content/notice-detail/index?id=${encodeURIComponent(data.noticeId)}`
          : `/pages/content/webview/index?slot=${encodeURIComponent(slot)}`;
        wx.navigateTo({ url, fail: () => wx.showToast({ title: '页面打开失败，请重试', icon: 'none' }) });
      } catch (error) { wx.showToast({ title: error.message, icon: 'none' }); }
      finally { this.opening = false; }
    },
    imageError(event) {
      const dataset = event && event.currentTarget && event.currentTarget.dataset || {};
      console.warn('[home-ads] 图片加载失败', {
        slot: dataset.slot || '',
        url: dataset.src || '',
        errMsg: event && event.detail && event.detail.errMsg || '未返回错误信息'
      });
      this.setData({ error: '广告图片加载失败，点击重试' });
    }
  }
});
