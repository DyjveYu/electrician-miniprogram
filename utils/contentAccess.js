const LOGIN = '/pages/login/login?entry=electrician-home';
const LIST = '/pages/content/electrician-home/index';
const app = () => getApp();
function topPage() {
  const pages = getCurrentPages();
  return pages[pages.length - 1];
}
function showMessage(message) { wx.showToast({ title: message, icon: 'none' }); }
function login() {
  const instance = app();
  instance.globalData.contentLoginEntry = 'electrician-home';
  const page = topPage();
  if (page && page.route === 'pages/login/login') {
    if (page.enterElectricianHomeLogin) page.enterElectricianHomeLogin();
    return;
  }
  if (instance._contentNavigating) return;
  instance._contentNavigating = true;
  wx.navigateTo({ url: LOGIN, complete: () => { instance._contentNavigating = false; } });
}
function ensureAccess() {
  const data = app().globalData;
  if (!data.token || !data.userInfo || !data.userInfo.phone) { login(); return false; }
  if (['banned', 'frozen'].includes(data.userInfo.status)) {
    showMessage(data.userInfo.status === 'banned' ? '账号已被禁用' : '账号已被冻结，请联系客服');
    return false;
  }
  if (data.userInfo.current_role !== 'electrician') { showMessage('本功能仅对电工开放'); return false; }
  return true;
}
function openHome() {
  if (!ensureAccess()) return;
  const instance = app();
  if (instance._contentNavigating) return;
  instance._contentNavigating = true;
  wx.navigateTo({ url: LIST, complete: () => { instance._contentNavigating = false; } });
}
function handleError(error) {
  if (error.statusCode === 401) {
    app().logout({ entry: 'electrician-home' });
    return true;
  }
  return false;
}
function formatArticleDate(value) {
  if (!value) return '';
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? new Date(time + 8 * 60 * 60 * 1000).toISOString().slice(0, 16).replace('T', ' ') : '';
}
module.exports = { ensureAccess, openHome, handleError, login, formatArticleDate };
