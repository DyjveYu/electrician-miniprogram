const { ContentAPI } = require('../../../utils/api');
Page({
  data: { url: '', error: '', loading: true },
  onLoad(options) { this.slot = options.slot; this.loadTarget(); },
  async loadTarget() {
    this.setData({ url: '', error: '', loading: true });
    try {
      const { data } = await ContentAPI.resolveTarget(this.slot || '');
      if (data.type === 'notice') {
        wx.redirectTo({ url: `/pages/content/notice-detail/index?id=${encodeURIComponent(data.noticeId)}`,
          fail: () => this.setData({ error: '内容不可用', loading: false }) });
        return;
      }
      if (data.type !== 'external' || !/^https:\/\//i.test(data.url)) throw new Error('内容不可用');
      // 只使用服务器返回的当前URL，不拼接令牌、用户信息，不请求外部业务API。
      this.setData({ url: data.url, loading: false });
    } catch (error) { this.setData({ error: error.message, loading: false }); }
  },
  onWebError() { this.setData({ url: '', loading: false, error: '网页加载失败，请返回或重试' }); },
  onWebLoad() { this.setData({ loading: false }); },
  goBack() { wx.navigateBack({ fail: () => wx.reLaunch({ url: '/pages/login/login' }) }); }
});
