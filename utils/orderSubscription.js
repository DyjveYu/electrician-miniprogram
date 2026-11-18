const { API } = require('./api');
const app = getApp();
const path = '/wechat-order-subscriptions';
function session(page) {
  const user = app.globalData.userInfo;
  const allowed = page.data.orderSubscriptionType === 'accepted' ? ['user','enterprise'] : ['electrician'];
  return page._subscriptionVisible !== false && app.globalData.token && allowed.includes(user?.current_role)
    ? [app.globalData.token, user.id, app._orderSessionVersion || 0].join(':') : null;
}
function ok(result) {
  if (result?.code !== 200 || result.success === false || result.data?.success === false) throw new Error(result?.message || '订阅请求失败');
  return result.data;
}
async function load(page) {
  const account = session(page), generation = page._subscriptionGeneration = (page._subscriptionGeneration || 0) + 1;
  if (page._subscriptionAccount !== account) {
    page._subscriptionAccount = account;
    page._subscriptionAction = (page._subscriptionAction || 0) + 1;
    page.setData({ orderSubscriptionEnabled: false, orderSubscriptionTemplate: '', orderSubscriptionBusy: false });
  }
  if (!account) { page.setData({ orderSubscriptionEnabled: false }); return; }
  try {
    const data = ok(await API.request({ url: path + (page.data.orderSubscriptionType === 'accepted' ? '?type=accepted' : ''), showError: false }));
    if (account !== session(page) || generation !== page._subscriptionGeneration) return;
    page.setData({ orderSubscriptionEnabled: data?.enabled === true && !!data.templateId, orderSubscriptionTemplate: data?.templateId || '' });
  } catch {
    if (account === session(page) && generation === page._subscriptionGeneration) page.setData({ orderSubscriptionEnabled: false });
  }
}
// wx.requestSubscribeMessage保持在点击事件的同步调用链中，不能在页面加载时主动弹出。
function subscribe(page) {
  const account = session(page), templateId = page.data.orderSubscriptionTemplate;
  if (!account || page.data.orderSubscriptionBusy || !page.data.orderSubscriptionEnabled || !templateId) return;
  if (typeof wx.requestSubscribeMessage !== 'function') { wx.showToast({ title: '当前微信版本不支持订阅', icon: 'none' }); return; }
  const action = page._subscriptionAction = (page._subscriptionAction || 0) + 1;
  const current = () => account === session(page) && action === page._subscriptionAction;
  const done = () => { if (current()) page.setData({ orderSubscriptionBusy: false }); };
  page.setData({ orderSubscriptionBusy: true });
  wx.requestSubscribeMessage({ tmplIds: [templateId],
    success: result => {
      if (!current()) return;
      if (result[templateId] !== 'accept') {
        wx.showToast({ title: page.data.orderSubscriptionType === 'accepted' ? '未订阅，不影响订单' : '未订阅，仍可正常接单', icon: 'none' }); done(); return;
      }
      wx.login({ success: async login => {
        if (!current()) return;
        try {
          if (!login.code) throw new Error('微信身份核验失败，请重试');
          const requestKey = 'order_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 12).padEnd(10, '0');
          const payload = { request_key: requestKey, template_id: templateId, result: 'accept', login_code: login.code,
            ...(page.data.orderSubscriptionType === 'accepted' ? { event_type: 'accepted', order_id: page.data.orderId } : {}) };
          // 网络响应丢失时用同一个提交编号重试，避免重复记录一次授权。
          let response;
          try { response = await API.request({ url: path, method: 'POST', data: payload, showError: false }); }
          catch (error) {
            if (!current() || error.code != null) throw error;
            response = await API.request({ url: path, method: 'POST', data: payload, showError: false });
          }
          const data = ok(response);
          if (current()) {
            if (data?.recorded !== true) throw new Error('订阅记录未确认，请重试');
            wx.showToast({ title: '本次订阅已记录', icon: 'success' });
          }
        } catch (error) { if (current()) wx.showToast({ title: error.message || '订阅记录失败，请重试', icon: 'none' }); }
        finally { done(); }
      }, fail: () => { if (current()) wx.showToast({ title: '微信登录失败，请重试', icon: 'none' }); done(); } });
    }, fail: () => { if (current()) wx.showToast({ title: '订阅未完成，可稍后重试', icon: 'none' }); done(); }
  });
}
function hide(page) {
  page._subscriptionVisible = false; page._subscriptionGeneration = (page._subscriptionGeneration || 0) + 1;
  page._subscriptionAction = (page._subscriptionAction || 0) + 1;
  page.setData({ orderSubscriptionBusy: false });
}
module.exports = { load, subscribe, hide };
