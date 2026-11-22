const { CERTIFICATION_PAGE } = require('./enterpriseSession');
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
  const app = getApp();
  const data = app?.globalData;
  if (app?._enterpriseCacheCheck || app?._enterpriseCertificationSession ||
      (page.route === CERTIFICATION_PAGE && !data?.token)) return;
  if (!page.route || visiblePage === page) return;
  visiblePage = page;
  if (!data?.baseUrl || pending >= 12) return;
  const token = data.token;
  const sessionId = syncSession(data.userInfo);
  const body = { eventId: newId(), route: page.route, visitorId: getInstallation(), sessionId };
  const header = { 'content-type': 'application/json' };
  if (token) header.Authorization = `Bearer ${token}`;
  pending += 1;
  const finish = () => { pending -= 1; };
  function send(retry) {
    if (app._enterpriseCacheCheck || app._enterpriseCertificationSession ||
        (retry && data.token !== token) || session !== sessionId) return finish();
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

function rejectOutsideCertification(page, app) {
  if (page._enterprisePageBlocked) return true;
  if (!app?._enterpriseCertificationSession || page.route === CERTIFICATION_PAGE) return false;
  page._enterprisePageBlocked = true;
  app.logout({ forceLogin: true });
  return true;
}

function register(Page, definition) {
  const { onLoad, onShow, onReady, onHide, onUnload } = definition;
  function show(page, args) {
    if (rejectOutsideCertification(page, getApp())) return;
    if (page._enterpriseDeferredLoad) {
      const load = page._enterpriseDeferredLoad;
      page._enterpriseDeferredLoad = null;
      onLoad?.apply(page, load.args);
    }
    try { capture(page); } catch (_) { /* A reporting error cannot interrupt the page. */ }
    const result = onShow?.apply(page, args);
    if (page._enterpriseDeferredReady) {
      const readyArgs = page._enterpriseDeferredReady;
      page._enterpriseDeferredReady = null;
      onReady?.apply(page, readyArgs);
    }
    return result;
  }
  return Page({ ...definition,
    onLoad(...args) {
      const app = getApp();
      if (app?._enterpriseCacheCheck) {
        this._enterpriseDeferredLoad = { args, check: app._enterpriseCacheCheck };
        return;
      }
      if (!rejectOutsideCertification(this, app)) return onLoad?.apply(this, args);
    },
    onShow(...args) {
      this._enterprisePageVisible = true;
      const check = getApp()?._enterpriseCacheCheck || this._enterpriseDeferredLoad?.check;
      if (!check) return show(this, args);
      if (this._enterpriseWaitingCheck === check) return;
      this._enterpriseWaitingCheck = check;
      check.then(verified => {
        if (this._enterpriseWaitingCheck !== check) return;
        this._enterpriseWaitingCheck = null;
        if (!verified) {
          this._enterprisePageBlocked = true;
          return;
        }
        if (this._enterpriseDeferredLoad) this._enterpriseDeferredLoad.check = null;
        if (this._enterprisePageVisible) show(this, args);
      });
    },
    onReady(...args) {
      const app = getApp();
      if (app?._enterpriseCacheCheck || this._enterpriseDeferredLoad) {
        this._enterpriseDeferredReady = args;
        return;
      }
      if (!rejectOutsideCertification(this, app)) return onReady?.apply(this, args);
    },
    onHide(...args) {
      this._enterprisePageVisible = false;
      if (!this._enterpriseDeferredLoad && !this._enterprisePageBlocked) return onHide?.apply(this, args);
    },
    onUnload(...args) {
      this._enterprisePageVisible = false;
      this._enterpriseWaitingCheck = null;
      if (visiblePage === this) visiblePage = undefined;
      if (!this._enterpriseDeferredLoad && !this._enterprisePageBlocked) return onUnload?.apply(this, args);
    }
  });
}

module.exports = { register, resetSession, syncSession };
