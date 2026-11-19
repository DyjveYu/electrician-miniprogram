const VISITOR_KEY = 'miniapp_visit_installation_v1';
const PHONE = /^1[3-9]\d{9}$/;
let installation;
let session;
let previousPhone;
let visiblePage;
let pending = 0;

function newId() {
  return `${Date.now().toString(36)}-${Array.from({ length: 4 }, () =>
    Math.random().toString(36).slice(2).padEnd(11, '0')).join('')}`;
}

function resetSession() {
  session = undefined;
  previousPhone = undefined;
}

function syncSession(user) {
  const phone = PHONE.test(user?.phone) ? user.phone : null;
  if (!session || (previousPhone && previousPhone !== phone)) session = newId();
  previousPhone = phone;
  return session;
}

function getInstallation() {
  if (installation) return installation;
  try { installation = wx.getStorageSync(VISITOR_KEY); } catch (_) {}
  if (typeof installation !== 'string' || !/^[a-z0-9-]{24,80}$/.test(installation)) {
    installation = newId();
    try { wx.setStorageSync(VISITOR_KEY, installation); } catch (_) {}
  }
  return installation;
}

function capture(page) {
  if (!page.route || visiblePage === page) return;
  visiblePage = page;
  const data = getApp()?.globalData;
  if (!data?.baseUrl || pending >= 12) return;
  const token = data.token;
  const sessionId = syncSession(data.userInfo);
  const body = { eventId: newId(), route: page.route, visitorId: getInstallation(), sessionId };
  const header = { 'content-type': 'application/json' };
  if (token) header.Authorization = `Bearer ${token}`;
  pending += 1;
  const finish = () => { pending -= 1; };
  function send(retry) {
    if ((retry && data.token !== token) || session !== sessionId) return finish();
    const again = () => retry ? finish() : setTimeout(() => send(true), 1000);
    try {
      wx.request({
        url: `${data.baseUrl}/visits/events`, method: 'POST', data: body, header, timeout: 4500,
        success: ({ statusCode }) => statusCode >= 500 && statusCode !== 503 ? again() : finish(),
        fail: again
      });
    } catch (_) { finish(); }
  }
  // Don't share the business request wrapper or its loading / login state.
  setTimeout(() => send(false), 0);
}

function register(Page, definition) {
  const { onShow, onUnload } = definition;
  return Page({ ...definition,
    onShow(...args) {
      try { capture(this); } catch (_) { /* A reporting error cannot interrupt the page. */ }
      return onShow?.apply(this, args);
    },
    onUnload(...args) {
      if (visiblePage === this) visiblePage = undefined;
      return onUnload?.apply(this, args);
    }
  });
}

module.exports = { register, resetSession, syncSession };
