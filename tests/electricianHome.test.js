// 原生小程序运行时隔离验证：真实页面/工具源码 + wx桩，无网络和账号数据。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

const { harness } = require('./helpers/contentHarness');
const tick = () => new Promise(resolve => setImmediate(resolve));
const article = { id: 1, title: '标题', published_at: '2026-10-25', read_count: '1', body: [{ type: 'text', text: '<script>只是文字</script>' }, { type: 'image', url: '/uploads/content/image.png' }] };

test('V4/V7: 匿名从现有登录页点击只预选电工且不重叠，不被isLogin送回首页', () => {
  const h = harness(); h.login('user', '');
  const page = h.page('pages/login/login.js'); page.onLoad({});
  h.load('utils/contentAccess.js').openHome();
  page.onShow(); h.timers.forEach(callback => callback());
  assert.equal(page.data.selectedRole, 'electrician'); assert.equal(h.calls.navigate.length, 0); assert.equal(h.calls.relaunch.length, 0);
  assert.equal(h.calls.scroll[0].selector, '#login-form');
});
test('V3/V4: 访客直达带来源登录；个人企业仅提示并保留会话', () => {
  const h = harness(); const access = h.load('utils/contentAccess.js');
  assert.equal(access.ensureAccess(), false); assert.match(h.calls.navigate[0].url, /entry=electrician-home/);
  for (const role of ['user', 'enterprise']) {
    h.login(role); access.openHome(); assert.equal(h.app.globalData.token, 'isolated-token');
    assert.equal(h.calls.toast.at(-1).title, '本功能仅对电工开放');
  }
  h.login(); access.openHome(); assert.match(h.calls.navigate.at(-1).url, /electrician-home\/index/);
});
test('V4: 普通登录默认角色和已登录跳首页保持原行为', () => {
  const h = harness(); h.login('user'); const page = h.page('pages/login/login.js'); page.onLoad({}); page.onShow();
  h.timers.forEach(callback => callback());
  assert.equal(page.data.selectedRole, 'user'); assert.equal(h.calls.relaunch[0].url, '/pages/index/index');
});
test('V4: 冷启动来源在token校验前保留；主动切回普通角色可解除来源', () => {
  const h = harness();
  h.app.getSystemInfo = () => {};
  h.app.checkLoginStatus = () => assert.equal(h.app.globalData.contentLoginEntry, 'electrician-home');
  h.app._parseReferrer = () => {};
  h.app.onLaunch({ path: 'pages/content/article-detail/index', query: { id: '1' } });
  const page = h.page('pages/login/login.js'); page.onLoad({ entry: 'electrician-home' }); page.onReady();
  page.selectRole({ currentTarget: { dataset: { role: 'user' } } });
  assert.equal(page._contentEntry, false); assert.equal(h.app.globalData.contentLoginEntry, null); assert.equal(page.data.selectedRole, 'user');
});
test('V4: 内容401与全局verifyToken竞态均只落电工入口；迟到旧token验证不退出新登录', () => {
  for (const contentFirst of [false, true]) {
    const h = harness(); h.login(); h.pages.push({ route: 'pages/content/article-detail/index' });
    const access = h.load('utils/contentAccess.js');
    h.app.verifyToken();
    if (contentFirst) access.handleError({ statusCode: 401 });
    h.calls.request[0].success({ statusCode: 401, data: {} });
    if (!contentFirst) access.handleError({ statusCode: 401 });
    assert.ok(h.calls.relaunch.every(call => call.url.endsWith('?entry=electrician-home')));
    const loginPage = h.page('pages/login/login.js'); loginPage.onLoad({ entry: 'electrician-home' });
    access.handleError({ statusCode: 401 }); assert.equal(loginPage.data.selectedRole, 'electrician');
  }
  const h = harness(); h.login(); h.app.verifyToken(); h.app.login({ phone: 'new-test', current_role: 'user' }, 'new-token');
  h.calls.request[0].success({ statusCode: 401, data: {} });
  assert.equal(h.app.globalData.token, 'new-token'); assert.equal(h.calls.relaunch.length, 0);
});
test('V6: onLoad不读，onShow每个可见周期只自动读一次，隐藏清正文且晚回包被忽略', async () => {
  const h = harness(); h.login(); const page = h.page('pages/content/article-detail/index.js'); page.onLoad({ id: '1' });
  assert.equal(h.calls.request.length, 0); page.onShow(); page.onShow();
  assert.equal(h.calls.request.length, 1); h.respond(0, article); await tick();
  assert.equal(page.data.article.read_count, '1'); assert.match(page.data.article.body[1].src, /^http/);
  page.onHide(); assert.equal(page.data.article, null); page.onShow();
  assert.equal(h.calls.request.length, 2); page.onHide(); h.respond(1, article); await tick();
  assert.equal(page.data.article, null);
});
test('V5/V6: 不自动重试，未知结果人工确认后才新请求，下架404不显示旧正文', async () => {
  const h = harness(); h.login(); const page = h.page('pages/content/article-detail/index.js'); page.onLoad({ id: '1' }); page.onShow();
  h.calls.request[0].fail({}); await tick();
  assert.equal(h.calls.request.length, 1); assert.equal(page.data.uncertain, true); page.retry();
  assert.equal(h.calls.request.length, 1); assert.match(h.calls.modal[0].content, /可能已计入阅读量/);
  h.calls.modal[0].success({ confirm: true }); h.calls.modal[0].complete();
  assert.equal(h.calls.request.length, 2); h.respond(1, article); await tick();
  page.onHide(); page.onShow(); h.respond(2, null, 404); await tick();
  assert.equal(page.data.article, null); assert.equal(page.data.error, '内容不可用'); assert.equal(page.data.uncertain, false);
});
test('V3/V5: 身份变更丢弃旧请求回包，403不登出且不返回正文', async () => {
  const h = harness(); h.login(); const page = h.page('pages/content/article-detail/index.js'); page.onLoad({ id: '1' }); page.onShow();
  h.app.globalData.token = 'changed-token'; h.respond(0, article); await tick();
  assert.equal(page.data.article, null); assert.match(page.data.error, /登录状态已变化/);
  page.retry(); h.respond(1, null, 403); await tick(); assert.equal(h.app.globalData.token, 'changed-token'); assert.equal(page.data.article, null);
});
test('V5/V7: 列表每页仅20，不含正文，返回时重载；连续点击只打开一次', async () => {
  const h = harness(); h.login(); const page = h.page('pages/content/electrician-home/index.js'); page.onShow();
  h.respond(0, { list: [{ id: 1, title: '文章', read_count: '0', published_at: '2026-10-25' }], page: 1, pages: 2, total: 21 }); await tick();
  page.openArticle({ currentTarget: { dataset: { id: 1 } } }); page.openArticle({ currentTarget: { dataset: { id: 1 } } });
  assert.equal(h.calls.navigate.length, 1);
  page.onHide(); page.onShow(); h.respond(1, { list: [{ id: 1, title: '文章', read_count: '1' }], page: 1, pages: 2, total: 21 }); await tick();
  assert.equal(page.data.list[0].read_count, '1'); page.next(); assert.match(h.calls.request[2].url, /page=2&pageSize=20/);
  h.respond(2, { list: [{ id: 2, title: '第二页' }], page: 2, pages: 2, total: 21 }); await tick();
  assert.equal(page.data.list.length, 1); assert.equal(page.data.list[0].id, 2);
});
test('V8: 公共内容不附JWT；内容JWT请求不调用通用退出，保留状态码', async () => {
  const h = harness(); h.login(); const { ContentAPI, ElectricianHomeAPI } = h.load('utils/api.js');
  const publicResult = ContentAPI.getAds(); assert.equal(h.calls.request[0].header, undefined); h.respond(0, []); await publicResult;
  const result = ElectricianHomeAPI.detail('1'); assert.equal(h.calls.request[1].header.Authorization, 'Bearer isolated-token');
  h.respond(1, null, 401); await assert.rejects(result, error => error.statusCode === 401);
  assert.equal(h.calls.relaunch.length, 0);
});
test('V5: 首次发布时间按北京时间展示，UTC前一天不影响清晨日期', () => {
  const { formatArticleDate } = harness().load('utils/contentAccess.js');
  assert.equal(formatArticleDate('2026-10-24T23:30:00.000Z'), '2026-10-25 07:30');
  assert.equal(formatArticleDate('2026-10-25T07:30:00+08:00'), '2026-10-25 07:30');
  assert.equal(formatArticleDate(null), ''); assert.equal(formatArticleDate('invalid'), '');
});
test('V7/V8: 三首页和认证页共用入口，原广告与启动页保留，正文为纯文本节点', () => {
  for (const name of ['login/login', 'index/index', 'profile/certification/certification']) {
    const config = JSON.parse(fs.readFileSync(path.join(root, `pages/${name}.json`), 'utf8'));
    assert.equal(config.usingComponents['electrician-home-entry'], '/components/electrician-home-entry/index');
    assert.match(fs.readFileSync(path.join(root, `pages/${name}.wxml`), 'utf8'), /<electrician-home-entry/);
  }
  const wxml = fs.readFileSync(path.join(root, 'pages/content/article-detail/index.wxml'), 'utf8');
  assert.match(wxml, /<text[^>]*item.type === 'text'/); assert.doesNotMatch(wxml, /rich-text|web-view/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).pages[0], 'pages/index/index');
});
