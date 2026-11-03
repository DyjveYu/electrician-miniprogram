// 只处理本项目、带当前企业凭据的请求；不拦截公共内容或其他身份的响应。
function capture(options) {
  const app = getApp(), data = app.globalData, user = data.userInfo;
  const authorization = options.header && (options.header.Authorization || options.header.authorization);
  const base = String(data.baseUrl || '').replace(/\/$/, '');
  if (!user || user.current_role !== 'enterprise' || !data.token || !base ||
      !(options.url === base || options.url.startsWith(base + '/')) || authorization !== `Bearer ${data.token}`) return null;
  return { app, id: user.id, token: data.token, version: app._orderSessionVersion || 0 };
}
function current(session) {
  const data = session.app.globalData;
  return data.userInfo && data.userInfo.current_role === 'enterprise' && data.userInfo.id === session.id &&
    data.token === session.token && (session.app._orderSessionVersion || 0) === session.version;
}
function requestWith(method, options) {
  const session = capture(options);
  if (!session) return wx[method](options);
  const fail = error => options.fail && options.fail(error);
  const stale = () => fail({ errMsg: '登录状态已变化，请重新进入', sessionChanged: true });
  return wx[method]({ ...options,
    success(res) {
      if (!current(session)) return stale();
      let body = res.data;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = null; } }
      if (res.statusCode === 403 && body && body.data && body.data.reason === 'ENTERPRISE_FROZEN') {
        // 先清会话，再通知调用方失败，阻止其成功处理及后来响应恢复旧数据。
        session.app.logout({ forceLogin: true });
        wx.hideLoading();
        try { fail({ errMsg: '账号已被冻结，请联系客服', statusCode: 403, data: body.data, enterpriseFrozen: true }); }
        finally { wx.showModal({ title: '账号已被冻结', content: '账号已被冻结，请联系客服', showCancel: false, confirmColor: '#16835c' }); }
        return;
      }
      if (options.success) return options.success(res);
    },
    fail(error) { return current(session) ? fail(error) : stale(); }
  });
}
module.exports = {
  request: options => requestWith('request', options),
  uploadFile: options => requestWith('uploadFile', options)
};
