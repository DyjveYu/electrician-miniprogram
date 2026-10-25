const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { harness } = require('./helpers/contentHarness');
const root = path.resolve(__dirname, '..');
const tick = () => new Promise(resolve => setImmediate(resolve));
function board(count, manual = false) {
  let definition, timerId = 0;
  const timers = new Map(), calls = [], navigation = [];
  let items = Array.from({ length: count }, (_, i) => ({ id: i + 1, title: `通知${i + 1}` }));
  let activeRequests = 0, maxRequests = 0;
  const api = { getNotices(params, options) {
    activeRequests++; maxRequests = Math.max(maxRequests, activeRequests);
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = () => { if (!settled) { settled = true; activeRequests--; } };
      const call = { ...params, success(data) { finish(); resolve({ data }); }, fail() { finish(); reject(new Error('网络请求失败')); },
        abort() { finish(); call.aborted = true; reject(new Error('abort')); } };
      calls.push(call); options.onRequestTask(call);
      if (!manual) call.success({ notices: items.slice((params.page - 1) * 30, params.page * 30), pagination: { hasMore: params.page * 30 < items.length } });
    });
  } };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'components/notice-board/index.js'), 'utf8'), {
    require: () => ({ ContentAPI: api }), Component: value => { definition = value; },
    setTimeout: (callback, delay) => { assert.ok([300, 5000].includes(delay)); timers.set(++timerId, callback); return timerId; },
    clearTimeout: id => timers.delete(id), wx: { navigateTo: value => navigation.push(value), showToast() {} }, encodeURIComponent
  });
  const instance = { ...definition.methods, data: structuredClone(definition.data), setData(value) { Object.assign(this.data, value); } };
  return { instance, timers, calls, navigation, definition, get maxRequests() { return maxRequests; },
    setItems(value) { items = value; },
    async step(finishTransition = true) {
      assert.equal(timers.size, 1); const [id, callback] = timers.entries().next().value; timers.delete(id); callback(); await tick();
      if (finishTransition && instance.data.transitioning) {
        assert.equal(timers.size, 1); const [nextId, finish] = timers.entries().next().value; timers.delete(nextId); finish(); await tick();
      }
    }
  };
}
test('V5: 0/1/2/3条停播，空态与网络失败不同', async () => {
  for (const count of [0, 1, 2, 3]) {
    const b = board(count); b.instance.showBoard(); await tick();
    assert.equal(b.instance.data.group.length, count); assert.equal(b.timers.size, 0); assert.equal(b.instance.data.error, '');
  }
  const b = board(0, true); b.instance.showBoard(); b.calls[0].fail(); await tick();
  assert.match(b.instance.data.error, /网络/); assert.equal(b.timers.size, 0);
  b.instance.retry(); b.calls[1].success({ notices: [], pagination: { hasMore: false } }); await tick();
  assert.equal(b.instance.data.error, ''); assert.equal(b.calls.length, 2);
});
test('V5/V6: 4/5/6/31/61/121条覆盖全部分页后回首，20轮缓存与计时有界', async () => {
  for (const count of [4, 5, 6, 31, 61, 121]) {
    const b = board(count); b.instance.showBoard(); await tick();
    const groupCount = Math.ceil(count / 3);
    for (let cycle = 0; cycle < 20; cycle++) {
      const seen = [];
      for (let i = 0; i < groupCount; i++) {
        seen.push(...b.instance.data.group.map(x => x.id));
        assert.ok(b.instance.data.group.length <= 3); assert.ok(b.instance._items.length <= 30);
        await b.step();
      }
      assert.deepEqual(seen, Array.from({ length: count }, (_, i) => i + 1));
      assert.equal(b.instance.data.group[0].id, 1);
    }
    assert.equal(b.maxRequests, 1); assert.equal(b.timers.size, 1);
  }
});
test('V5/V6: 三条到两条先滚动再替换，动画期间不误点，隐藏取消完成回调', async () => {
  const b = board(5); b.instance.showBoard(); await tick();
  await b.step(false);
  assert.equal(b.instance.data.transitioning, true);
  assert.deepEqual(Array.from(b.instance.data.group, x => x.id), [1, 2, 3]);
  assert.deepEqual(Array.from(b.instance.data.nextGroup, x => x.id), [4, 5]);
  b.instance.openNotice({ currentTarget: { dataset: { id: 1 } } }); assert.equal(b.navigation.length, 0);
  const staleFinish = b.timers.values().next().value;
  b.instance.hideBoard(); staleFinish();
  assert.equal(b.instance.data.transitioning, false); assert.equal(b.instance.data.group.length, 0); assert.equal(b.timers.size, 0);
  b.instance.showBoard(); await tick(); await b.step();
  assert.deepEqual(Array.from(b.instance.data.group, x => x.id), [4, 5]); assert.equal(b.instance.data.transitioning, false);
  const css = fs.readFileSync(path.join(root, 'components/notice-board/index.wxss'), 'utf8');
  assert.match(css, /\.notice-viewport\s*\{[^}]*height: 216rpx/);
  assert.match(css, /\.notice-group\s*\{[^}]*height: 216rpx/);
});
test('V6: 显隐/卸载取消请求，迟到旧响应不能覆盖新组或复活timer', async () => {
  const b = board(0, true);
  for (let i = 0; i < 20; i++) {
    b.instance.showBoard(); b.instance.showBoard(); assert.equal(b.calls.length, i + 1);
    b.instance.hideBoard(); assert.equal(b.calls[i].aborted, true);
    b.calls[i].success({ notices: [{ id: 99 }], pagination: { hasMore: true } }); await tick();
    assert.equal(b.instance.data.group.length, 0); assert.equal(b.timers.size, 0);
  }
  b.instance.showBoard(); b.calls.at(-1).success({ notices: [{ id: 1 }], pagination: { hasMore: false } }); await tick();
  assert.equal(b.instance.data.group[0].id, 1); assert.equal(b.maxRequests, 1);
  b.definition.lifetimes.detached.call(b.instance); assert.equal(b.timers.size, 0);
});
test('V6: 跨页失败保留最后组，手动重试同页；末页变空回首且空首停止', async () => {
  const b = board(0, true); b.instance.showBoard();
  b.calls[0].success({ notices: Array.from({ length: 30 }, (_, i) => ({ id: i + 1 })), pagination: { hasMore: true } }); await tick();
  for (let i = 0; i < 10; i++) await b.step();
  assert.equal(b.calls[1].page, 2); b.calls[1].fail(); await tick();
  assert.equal(b.instance.data.group[0].id, 28); assert.equal(b.timers.size, 0);
  b.instance.retry(); assert.equal(b.calls[2].page, 2);
  b.calls[2].success({ notices: [], pagination: { hasMore: false } }); await tick();
  assert.equal(b.calls[3].page, 1); b.calls[3].success({ notices: [], pagination: { hasMore: false } }); await tick();
  assert.equal(b.instance.data.group.length, 0); assert.equal(b.timers.size, 0); assert.equal(b.calls.length, 4);
});
test('V5/V7: 点击当前组只进入一次原公开详情，恢复后可再次点击', async () => {
  const b = board(4); b.instance.showBoard(); await tick();
  const event = { currentTarget: { dataset: { id: 1 } } };
  b.instance.openNotice(event); b.instance.openNotice(event); assert.equal(b.navigation.length, 1);
  assert.equal(b.navigation[0].url, '/pages/content/notice-detail/index?id=1');
  b.instance.hideBoard(); b.instance.showBoard(); await tick(); b.instance.openNotice(event); assert.equal(b.navigation.length, 2);
});
test('V7: 详情同周期一次、隐藏清正文、再次重读，取消后旧回包不恢复正文', async () => {
  const h = harness(); const page = h.page('pages/content/notice-detail/index.js'); page.onLoad({ id: '7' });
  const tasks = []; h.wx.request = options => { h.calls.request.push(options); const task = { aborted: false, abort() { this.aborted = true; options.fail({}); } }; tasks.push(task); return task; };
  page.onShow(); page.onShow(); assert.equal(h.calls.request.length, 1); assert.equal(h.calls.request[0].header, undefined);
  h.respond(0, { id: 7, title: '标题', content: '正文', published_at: '2026-10-25T00:00:00Z' }); await tick();
  assert.equal(page.data.notice.content, '正文'); assert.equal(page.data.notice.date, '2026-10-25 08:00');
  page.onHide(); assert.equal(page.data.notice, null); page.onShow(); page.onHide(); assert.equal(tasks[1].aborted, true);
  h.respond(1, { id: 7, content: '旧正文' }); await tick(); assert.equal(page.data.notice, null);
  page.onShow(); h.respond(2, null, 404); await tick(); assert.equal(page.data.error, '内容不可用');
  page.loadNotice(); h.respond(3, { id: 7, content: '新正文' }); await tick(); assert.equal(page.data.notice.content, '新正文');
  page.onUnload(); assert.equal(page.data.notice, null);
});
test('V7/V8: 公开详情冷启动/过期会话保护精确，离开后受限页恢复原导航', () => {
  const h = harness(); h.app.getSystemInfo = () => {}; h.app._parseReferrer = () => {};
  h.app.checkLoginStatus = () => { h.login(); h.app.verifyToken(); h.respond(0, null, 401); };
  h.app.onLaunch({ path: 'pages/content/notice-detail/index', query: { id: 7 } }); assert.equal(h.calls.relaunch.length, 0);
  const page = h.page('pages/content/notice-detail/index.js'); page.onLoad({ id: 7 }); page.onShow();
  h.app.logout(); assert.equal(h.calls.relaunch.length, 0); assert.equal(h.app._publicContentLaunchPending, false);
  h.pages.pop(); h.pages.push({ route: 'pages/message/detail/detail' }); h.app.logout(); assert.equal(h.calls.relaunch[0].url, '/pages/login/login');
});
test('V4/V5/V8: ContentAPI分页不附JWT；三首页共用组件且安全知识下方接入', async () => {
  const h = harness(); const { ContentAPI } = h.load('utils/api.js'); const promise = ContentAPI.getNotices();
  assert.match(h.calls.request[0].url, /notices\?page=1&pageSize=30$/); assert.equal(h.calls.request[0].header, undefined);
  h.respond(0, null, 401); await assert.rejects(promise); assert.equal(h.calls.relaunch.length, 0);
  for (const page of ['login/login', 'index/index']) {
    const config = JSON.parse(fs.readFileSync(path.join(root, `pages/${page}.json`), 'utf8'));
    assert.equal(config.usingComponents['notice-board'], '/components/notice-board/index');
    const source = fs.readFileSync(path.join(root, `pages/${page}.wxml`), 'utf8');
    assert.match(source, /<safety-knowledge-entry\s*\/>\s*<notice-board\s*\/>/);
  }
});
