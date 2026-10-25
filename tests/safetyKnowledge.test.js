const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { harness } = require('./helpers/contentHarness');
const root = path.resolve(__dirname, '..');
const tick = () => new Promise(resolve => setImmediate(resolve));
const article = { id: 2, title: '安全知识', published_at: '2026-10-24T23:30:00Z', read_count: '9007199254740994', body: [{ type: 'text', text: '<script>纯文本</script>' }, { type: 'image', url: '/uploads/content/image.png' }] };
const detail = h => { const page = h.page('pages/content/safety-knowledge-detail/index.js'); page.onLoad({ id: '2' }); return page; };

test('V3/V7: 访客、匿名及各角色无需鉴权，公开请求不附JWT且不会触发登出', async () => {
  for (const role of [null, 'anonymous', 'user', 'enterprise', 'electrician']) {
    const h = harness();
    if (role) h.login(role === 'anonymous' ? 'user' : role, role === 'anonymous' ? '' : 'test');
    const page = detail(h); page.onShow();
    assert.equal(h.calls.request.length, 1); assert.equal(h.calls.request[0].header, undefined);
    assert.match(h.calls.request[0].url, /\/content\/safety-knowledge\/articles\/2$/);
    h.respond(0, article); await tick();
    assert.equal(page.data.article.read_count, article.read_count);
    assert.equal(page.data.article.date, '2026-10-25 07:30');
    assert.equal(h.calls.navigate.length, 0); assert.equal(h.calls.relaunch.length, 0);
  }
});

test('V7: 共用公开入口每次点击只导航一次，返回后可重新打开', () => {
  const h = harness(); const entry = h.component('components/safety-knowledge-entry/index.js');
  entry.openKnowledge(); entry.openKnowledge();
  assert.equal(h.calls.navigate.length, 1); assert.equal(h.calls.navigate[0].url, '/pages/content/safety-knowledge/index');
  entry.pageLifetimes.show.call(entry); entry.openKnowledge();
  assert.equal(h.calls.navigate.length, 2); assert.equal(h.calls.relaunch.length, 0);
});

test('V7: 公开冷启动首Page尚未入栈时401只清会话，不导航离开公开页', () => {
  for (const target of ['safety-knowledge', 'safety-knowledge-detail']) {
    const h = harness();
    h.app.getSystemInfo = () => {}; h.app._parseReferrer = () => {};
    h.app.checkLoginStatus = () => { h.login(); h.app.verifyToken(); h.respond(0, null, 401); };
    h.app.onLaunch({ path: `pages/content/${target}/index`, query: { id: '2' } });
    assert.equal(h.app.globalData.token, null); assert.equal(h.calls.relaunch.length, 0);
    assert.equal(h.calls.removed.includes('token'), true);
  }
});

test('V7: 公开页已入栈时401保持可见，离开到普通页后恢复原退出导航', async () => {
  const h = harness(); h.login(); h.app._publicContentLaunchPending = true;
  const page = detail(h); page.onShow(); h.respond(0, article); await tick();
  assert.equal(h.app._publicContentLaunchPending, false);
  h.app.verifyToken(); h.respond(1, null, 401);
  assert.equal(h.calls.relaunch.length, 0); assert.equal(page.data.article.id, 2);
  page.onHide(); h.pages.pop(); h.pages.push({ route: 'pages/index/index' });
  h.app._publicContentLaunchPending = true; h.app.logout();
  assert.equal(h.calls.relaunch[0].url, '/pages/login/login'); assert.equal(h.app._publicContentLaunchPending, false);
});

test('V7: 相似名称和其他启动路径不享受公开页导航保护', () => {
  const h = harness(); h.app.getSystemInfo = () => {}; h.app.checkLoginStatus = () => {}; h.app._parseReferrer = () => {};
  h.app.onLaunch({ path: 'pages/content/safety-knowledge-other/index' });
  h.app.logout(); assert.equal(h.calls.relaunch[0].url, '/pages/login/login');
});

test('V5/V6: onLoad不请求、同周期一次，隐藏清正文且迟到响应被忽略', async () => {
  const h = harness(); const page = detail(h);
  assert.equal(h.calls.request.length, 0); page.onShow(); page.onShow();
  assert.equal(h.calls.request.length, 1); h.respond(0, article); await tick();
  assert.equal(page.data.article.body[0].text, article.body[0].text);
  assert.match(page.data.article.body[1].src, /^http/);
  page.onHide(); assert.equal(page.data.article, null); page.onShow();
  assert.equal(h.calls.request.length, 2); page.onHide(); h.respond(1, article); await tick();
  assert.equal(page.data.article, null);
  page.onShow(); h.respond(2, null, 404); await tick(); assert.equal(page.data.error, '内容不可用'); assert.equal(page.data.article, null);
});

test('V5/V6: 网络结果不明先确认再重试，无自动重试且离开后的确认不发请求', async () => {
  const h = harness(); const page = detail(h); page.onShow();
  h.calls.request[0].fail({}); await tick();
  assert.equal(page.data.uncertain, true); assert.equal(h.calls.request.length, 1);
  page.retry(); page.retry(); assert.equal(h.calls.modal.length, 1);
  assert.match(h.calls.modal[0].content, /可能已计入阅读量/);
  h.calls.modal[0].success({ confirm: true }); h.calls.modal[0].complete();
  assert.equal(h.calls.request.length, 2); h.respond(1, null, 500); await tick(); assert.equal(page.data.uncertain, true);
  page.retry(); page.onHide(); h.calls.modal[1].success({ confirm: true }); h.calls.modal[1].complete();
  assert.equal(h.calls.request.length, 2);
});

test('V3/V5: 公开API的401保留会话，404可直接人工重试，身份变化不废弃公开正文', async () => {
  const h = harness(); h.login('user'); const page = detail(h); page.onShow();
  h.respond(0, null, 401); await tick(); assert.equal(h.app.globalData.token, 'isolated-token'); assert.equal(h.calls.relaunch.length, 0);
  page.retry(); h.respond(1, null, 404); await tick(); assert.equal(page.data.uncertain, false);
  page.retry(); h.app.globalData.token = 'changed'; h.respond(2, article); await tick();
  assert.equal(h.calls.modal.length, 0); assert.equal(page.data.article.id, 2);
});

test('V5/V6: 列表单页分页、空末页回落、返回刷新阅读量、连续点击只进入一次', async () => {
  const h = harness(); const page = h.page('pages/content/safety-knowledge/index.js'); page.onShow();
  h.respond(0, { list: [article], page: 1, pages: 2, total: 21 }); await tick();
  page.openArticle({ currentTarget: { dataset: { id: 2 } } }); page.openArticle({ currentTarget: { dataset: { id: 2 } } });
  assert.equal(h.calls.navigate.length, 1); assert.match(h.calls.navigate[0].url, /safety-knowledge-detail\/index\?id=2$/);
  page.next(); assert.match(h.calls.request[1].url, /page=2&pageSize=20/);
  h.respond(1, { list: [], page: 2, pages: 1, total: 1 }); await tick();
  assert.match(h.calls.request[2].url, /page=1&pageSize=20/);
  h.respond(2, { list: [{ ...article, read_count: '4' }], page: 1, pages: 1, total: 1 }); await tick();
  assert.equal(page.data.list.length, 1); assert.equal(page.data.list[0].read_count, '4');
  page.onHide(); page.onShow(); h.respond(3, { list: [{ ...article, read_count: '5' }], page: 1, pages: 1, total: 1 }); await tick();
  assert.equal(page.data.list[0].read_count, '5');
});

test('V5: 列表空态与失败可区分，离开后的列表响应不恢复旧内容', async () => {
  const h = harness(); const page = h.page('pages/content/safety-knowledge/index.js'); page.onShow();
  h.respond(0, { list: [], page: 1, pages: 0, total: 0 }); await tick(); assert.equal(page.data.error, ''); assert.equal(page.data.list.length, 0);
  page.retry(); h.calls.request[1].fail({}); await tick(); assert.match(page.data.error, /网络/);
  page.retry(); page.onHide(); h.respond(2, { list: [article], page: 1, pages: 1, total: 1 }); await tick(); assert.equal(page.data.list.length, 0);
});

test('V5/V7: 冷启动详情返回失败时回公开列表，不要求登录', () => {
  const h = harness(); const page = detail(h); h.wx.navigateBack = options => options.fail(); page.goBack();
  assert.equal(h.calls.relaunch[0].url, '/pages/content/safety-knowledge/index');
});

test('V7: 三首页注册共用公开入口、页面已注册、正文维持纯文本和图片', () => {
  for (const name of ['login/login', 'index/index']) {
    const config = JSON.parse(fs.readFileSync(path.join(root, `pages/${name}.json`), 'utf8'));
    assert.equal(config.usingComponents['safety-knowledge-entry'], '/components/safety-knowledge-entry/index');
    assert.match(fs.readFileSync(path.join(root, `pages/${name}.wxml`), 'utf8'), /<safety-knowledge-entry/);
  }
  const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
  assert.equal(app.pages[0], 'pages/index/index');
  for (const name of ['safety-knowledge', 'safety-knowledge-detail']) assert.ok(app.pages.includes(`pages/content/${name}/index`));
  const wxml = fs.readFileSync(path.join(root, 'pages/content/safety-knowledge-detail/index.wxml'), 'utf8');
  assert.match(wxml, /<text[^>]*item.type === 'text'/); assert.doesNotMatch(wxml, /rich-text|web-view/);
});
