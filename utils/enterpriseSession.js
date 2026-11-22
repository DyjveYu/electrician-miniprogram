const CERTIFICATION_PAGE = 'pages/enterprise/certification/certification';
const CERTIFICATION_SESSION = 'enterprise_certification';
const CAPABILITY_HEADER = { 'X-Miniapp-Certification-Session': '1' };

function sameEnterprise(account, user) {
  return !!account?.id && !!user?.id && !!account.phone && String(account.id) === String(user.id) &&
    account.phone === user.phone && user.current_role === 'enterprise';
}

function hasBusinessAccess(profile) {
  return ['approved', 'returned'].includes(profile?.certStatus);
}

function successfulResponse(response) {
  return response?.statusCode === 200 && response.data?.success !== false &&
    (response.data?.success === true || [0, 200].includes(response.data?.code));
}

function readCertificationSession(payload, phone) {
  const expiresAt = Date.parse(payload?.expiresAt);
  const user = payload?.user;
  if (payload?.sessionType !== CERTIFICATION_SESSION || payload.token || typeof payload.certificationToken !== 'string' ||
      !payload.certificationToken || !user?.id || user.current_role !== 'enterprise' || user.phone !== phone ||
      !phone || typeof payload.expiresAt !== 'string' || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;
  return { user, token: payload.certificationToken, expiresAt };
}

// 只处理本项目当前企业会话的请求。
function capture(options) {
  const app = getApp(), data = app.globalData, user = data.userInfo;
  const authorization = options.header && (options.header.Authorization || options.header.authorization);
  const base = String(data.baseUrl || '').replace(/\/$/, '');
  if (!base || !(options.url === base || options.url.startsWith(base + '/'))) return null;
  const restricted = app._enterpriseCertificationSession;
  if (restricted && authorization === `Bearer ${restricted.token}`) return { app, restricted };
  if (!user || user.current_role !== 'enterprise' || !data.token || authorization !== `Bearer ${data.token}`) return null;
  return { app, id: user.id, token: data.token, version: app._orderSessionVersion || 0 };
}
function current(session) {
  if (session.restricted) return session.app._enterpriseCertificationSession === session.restricted;
  const data = session.app.globalData;
  return data.userInfo && data.userInfo.current_role === 'enterprise' && data.userInfo.id === session.id &&
    data.token === session.token && (session.app._orderSessionVersion || 0) === session.version;
}
function requestWith(method, options) {
  const session = capture(options);
  if (!session) return wx[method](options);
  const fail = error => options.fail && options.fail(error);
  const stale = () => fail({ errMsg: '登录状态已变化，请重新进入', sessionChanged: true });
  if (session.restricted) {
    const base = session.app.globalData.baseUrl.replace(/\/$/, '');
    const allowed = method === 'uploadFile' ? options.url === base + '/upload/certification' :
      options.url === base + '/miniprogram/enterprise/certification' && ['GET', 'POST'].includes(options.method);
    if (!allowed) return fail({ errMsg: '请先完成企业认证' });
    if (session.restricted.expiresAt <= Date.now()) {
      session.app.logout({ forceLogin: true });
      session.app.showToast('认证会话已过期，请重新登录');
      return stale();
    }
  }
  return wx[method]({ ...options,
    success(res) {
      if (!current(session)) return stale();
      let body = res.data;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = null; } }
      const reason = body && body.data && body.data.reason;
      if (res.statusCode === 403 && ['ENTERPRISE_FROZEN', 'ENTERPRISE_BLACKLISTED'].includes(reason)) {
        const blacklisted = reason === 'ENTERPRISE_BLACKLISTED';
        const message = blacklisted ? '您已被加入黑名单' : '账号已被冻结，请联系客服';
        // 先清会话，再通知调用方失败，阻止其成功处理及后来响应恢复旧数据。
        session.app.logout({ forceLogin: true });
        wx.hideLoading();
        try { fail({ errMsg: message, statusCode: 403, data: body.data, enterpriseFrozen: !blacklisted, enterpriseBlacklisted: blacklisted }); }
        finally { wx.showModal({ title: blacklisted ? '您已被加入黑名单' : '账号已被冻结', content: message, showCancel: false, confirmColor: '#16835c' }); }
        return;
      }
      if (session.restricted && res.statusCode === 401) {
        session.app.logout({ forceLogin: true });
        wx.hideLoading();
        session.app.showToast(body?.message || '认证会话已失效，请重新登录');
        return stale();
      }
      if (options.success) return options.success(res);
    },
    fail(error) { return current(session) ? fail(error) : stale(); }
  });
}
module.exports = {
  CERTIFICATION_PAGE,
  CERTIFICATION_SESSION,
  CAPABILITY_HEADER,
  sameEnterprise,
  hasBusinessAccess,
  successfulResponse,
  readCertificationSession,
  request: options => requestWith('request', options),
  uploadFile: options => requestWith('uploadFile', options)
};
