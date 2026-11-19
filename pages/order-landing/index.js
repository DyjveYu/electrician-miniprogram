// 分享／扫码仅保留推荐参数入口，个人建单复用手机号登录和统一表单。
require('../../utils/visitCapture').register(Page, {
  data: {},
  onLoad(options = {}) {
    const app = getApp();
    let source = options.referrer_id || '';
    if (!source && options.scene) {
      try { source = decodeURIComponent(options.scene).match(/(?:^|[^0-9])([0-9]+)(?:$|[^0-9])/)?.[1] || ''; } catch { source = ''; }
    }
    const id = Number(source);
    const suffix = Number.isSafeInteger(id) && id > 0 ? `&referrerId=${id}` : '';
    const user = app.globalData.userInfo;
    if (app.checkFrozenAndRedirect()) return;
    if (app.globalData.token && user?.phone) {
      if (!['user', 'enterprise'].includes(user.current_role)) {
        wx.showToast({ title: '当前身份不能创建下单用户订单', icon: 'none' });
        wx.reLaunch({ url: '/pages/index/index' });
        return;
      }
      wx.redirectTo({ url: '/pages/order/create/create' + (suffix ? '?' + suffix.slice(1) : '') });
      return;
    }
    wx.redirectTo({ url: '/pages/login/login?entry=personal-order' + suffix });
  }
});
