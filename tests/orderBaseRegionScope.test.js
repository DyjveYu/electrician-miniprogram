const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const feedback = require('../utils/orderTakeFeedback');

function setup(file = 'pages/order/detail/detail.js') {
  const calls = { requests: [], modals: [], toasts: [], tabs: [], timers: [], lists: [], hideLoading: 0 };
  const app = { globalData: { currentRole: 'electrician', isLogin: true, token: 'isolated', baseUrl: 'http://isolated/api', userInfo: { id: 7, status: 'active', current_role: 'electrician' } }, checkFrozenAndRedirect: () => false };
  let definition;
  const wx = {
    showModal: options => calls.modals.push(options), showToast: options => calls.toasts.push(options),
    showLoading() {}, hideLoading: () => calls.hideLoading++, stopPullDownRefresh() {},
    switchTab: options => calls.tabs.push(options), getStorageSync: () => null
  };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8'), {
    Page: value => { definition = value; }, getApp: () => app, wx,
    console: { log() {}, warn() {}, error() {} },
    setTimeout: fn => calls.timers.push(fn), clearTimeout() {},
    require: name => {
      if (name.endsWith('enterpriseSession')) return { request: options => calls.requests.push(options) };
      if (name.endsWith('orderTakeFeedback')) return feedback;
      if (name.endsWith('/util')) return { getOrderStatusText: value => value, formatTime: value => value, mapOrderToDisplayStatus: order => ({ code: order.status, text: order.status }), getDisplayStatusText: value => value };
      if (name.endsWith('/api')) return { OrderAPI: { getOrderList: params => new Promise((resolve, reject) => calls.lists.push({ params, resolve, reject })) } };
      throw new Error('Unexpected dependency: ' + name);
    }
  });
  const page = { ...definition, data: JSON.parse(JSON.stringify(definition.data)), setData(patch) { Object.assign(this.data, patch); } };
  page.data.orderId = '10';
  function submit() {
    page.acceptOrder();
    calls.modals.findLast(modal => modal.title === '确认接单').success({ confirm: true });
    return calls.requests.at(-1);
  }
  return { page, calls, app, submit };
}
const failure = (reason = 'ORDER_OUTSIDE_BASE_REGION', statusCode = 403) => ({ statusCode, data: { code: statusCode, data: { reason }, message: '服务端失败' } });

for (const response of [
  { statusCode: 403, data: { code: 200, success: true } },
  { statusCode: 200, data: { code: 403, success: true } },
  { statusCode: 200, data: { code: 200, success: false } },
  { statusCode: 200, data: {} },
  { statusCode: 200, data: { code: 200, data: { reason: 'ORDER_OUTSIDE_BASE_REGION' } } }
]) test('HTTP and business failure cannot be misreported as success: ' + JSON.stringify(response), () => {
  assert.equal(feedback.isTakeSuccess(response), false);
});
for (const code of [0, 200]) test('both existing successful business codes remain supported: ' + code, () => {
  assert.equal(feedback.isTakeSuccess({ statusCode: 200, data: { code } }), true);
});
test('unknown error reason does not inherit object properties', () => {
  assert.equal(feedback.regionError(failure('__proto__')), '');
});
for (const [reason, status] of [['ORDER_OUTSIDE_BASE_REGION', 403], ['ORDER_REGION_UNAVAILABLE', 409]]) {
  test('old detail shows the complete reason and blocks resubmission: ' + reason, () => {
    const { page, calls, submit } = setup();
    submit().success(failure(reason, status));
    assert.equal(page.data.taking, false); assert.equal(page.data.takeBlocked, true);
    const message = calls.modals.at(-1);
    assert.equal(message.content, feedback.regionError(failure(reason, status)));
    page.acceptOrder(); assert.equal(calls.requests.length, 1);
    assert.equal(calls.toasts.some(toast => toast.title === '接单成功'), false);
    assert.equal(calls.tabs.length, 0);
    message.success({ confirm: true });
    assert.equal(calls.tabs.at(-1).url, '/pages/index/index');
  });
}
test('HTTP 200 carrying a business region rejection still blocks and never redirects to my orders', () => {
  const { page, calls, submit } = setup();
  const response = failure(); response.statusCode = 200;
  submit().success(response);
  assert.equal(page.data.takeBlocked, true); assert.equal(calls.tabs.length, 0); assert.equal(calls.timers.length, 0);
});
test('duplicate clicks while confirming or submitting issue only one take request', () => {
  const { page, calls } = setup();
  page.acceptOrder(); page.acceptOrder();
  assert.equal(calls.modals.filter(item => item.title === '确认接单').length, 1);
  calls.modals.at(-1).success({ confirm: true }); page.acceptOrder();
  assert.equal(calls.requests.length, 1); assert.equal(page.data.taking, true);
});
test('cancel or failure to open confirmation releases the guard without a request', () => {
  const { page, calls } = setup();
  page.acceptOrder(); calls.modals.at(-1).success({ confirm: false });
  assert.equal(calls.requests.length, 0); assert.equal(page._takePending, false);
  page.acceptOrder(); calls.modals.at(-1).fail();
  assert.equal(calls.requests.length, 0); assert.equal(page._takePending, false);
});
test('successful take redirects once and cannot be submitted again before redirect', () => {
  const { page, calls, submit } = setup();
  submit().success({ statusCode: 200, data: { code: 200 } });
  assert.equal(page.data.taking, false); assert.equal(calls.hideLoading, 1);
  assert.equal(page.data.takeSucceeded, true); assert.equal(page.data.takeBlocked, false);
  page.acceptOrder(); assert.equal(calls.requests.length, 1);
  calls.timers.forEach(fn => fn());
  assert.equal(calls.tabs.at(-1).url, '/pages/order/list/list');
});
test('ordinary business errors release loading without reporting success', () => {
  const { page, calls, submit } = setup();
  submit().success({ statusCode: 409, data: { code: 409, message: '名额已满' } });
  assert.equal(page.data.taking, false); assert.equal(calls.toasts.at(-1).title, '名额已满'); assert.equal(calls.timers.length, 0);
});
test('network-unknown result queries detail and never automatically repeats the take', () => {
  const { page, calls, submit } = setup();
  submit().fail();
  assert.equal(page.data.taking, false);
  assert.equal(calls.requests.length, 2); assert.equal(calls.requests[1].method, 'GET');
  assert.equal(calls.requests.filter(req => req.method === 'POST').length, 1);
  assert.equal(calls.toasts.some(toast => toast.title === '接单成功'), false);
});
test('the current blocked page stays blocked after an onShow detail refresh', () => {
  const { page, submit } = setup(); submit().success(failure());
  page._firstShowSkipped = true; page.loadOrderDetail = () => {};
  page.onShow(); assert.equal(page.data.takeBlocked, true);
});
test('a newly entered detail is not permanently blocked by the previous page', () => {
  const first = setup(); first.submit().success(failure());
  const second = setup(); second.submit(); assert.equal(second.calls.requests.length, 1);
});

const event = { currentTarget: { dataset: { id: '10' } } };
test('existing list handler shows region failure and refreshes only its my-orders query', () => {
  const { page, calls } = setup('pages/order/list/list.js');
  page.acceptOrder(event); page.acceptOrder(event); assert.equal(calls.requests.length, 1);
  calls.requests[0].success(failure());
  assert.match(calls.modals.at(-1).content, /当前的接单区域/);
  assert.equal(calls.requests.length, 2); assert.equal(calls.requests[1].method, 'GET');
  assert.equal(calls.requests[1].data.my_orders, true);
  calls.requests[1].fail();
  page.onPullDownRefresh();
  assert.equal(calls.requests.at(-1).method, 'GET');
  assert.equal(calls.requests.filter(req => req.method === 'POST').length, 1);
});
test('existing list handler also accepts backend success code 200', () => {
  const { page, calls } = setup('pages/order/list/list.js');
  page.acceptOrder(event); calls.requests[0].success({ statusCode: 200, data: { code: 200 } });
  assert.equal(calls.toasts.at(-1).title, '接单成功'); assert.equal(calls.requests[1].method, 'GET');
});
test('list refresh business failure has feedback and a query-only retry', () => {
  const { page, calls } = setup('pages/order/list/list.js');
  page.acceptOrder(event); calls.requests[0].success(failure());
  calls.requests[1].success({ statusCode: 500, data: { code: 500, message: '查询失败' } });
  assert.equal(calls.toasts.at(-1).title, '查询失败'); assert.equal(page.data.loading, false);
  page.onPullDownRefresh(); assert.equal(calls.requests.at(-1).method, 'GET');
});

test('home onShow reloads the available list after returning from old detail', async () => {
  const { page, calls } = setup('pages/index/index.js');
  page.getCurrentLocation = () => {}; page.checkPendingReview = () => {};
  page.onShow();
  assert.equal(calls.lists.length, 1); assert.equal(calls.lists[0].params.my_orders, false);
  calls.lists[0].resolve({ code: 200, data: { list: [] } });
  await new Promise(resolve => setImmediate(resolve)); assert.equal(page.data.loading, false);
});
test('late pre-change nearby-list response cannot overwrite a newer refresh', async () => {
  const { page, calls } = setup('pages/index/index.js');
  const first = page.loadNearbyOrders(), second = page.loadNearbyOrders();
  calls.lists[1].resolve({ code: 200, data: { list: [{ id: 'new', status: 'pending' }] } }); await second;
  calls.lists[0].resolve({ code: 200, data: { list: [{ id: 'old', status: 'pending' }] } }); await first;
  assert.equal(page.data.nearbyOrders[0].id, 'new');
});
test('stale failed request cannot clear current loading or display an outdated failure', async () => {
  const { page, calls } = setup('pages/index/index.js');
  const first = page.loadNearbyOrders(), second = page.loadNearbyOrders();
  calls.lists[0].reject(new Error('old failure')); await first;
  assert.equal(page.data.loading, true); assert.equal(calls.toasts.length, 0);
  calls.lists[1].resolve({ code: 200, data: { list: [] } }); await second;
  assert.equal(page.data.loading, false);
});
test('home refresh failure is visible and pull-to-refresh only requests a list', async () => {
  const { page, calls } = setup('pages/index/index.js'); page.data.currentRole = 'electrician';
  const failed = page.loadNearbyOrders(); calls.lists[0].reject(new Error('query failed')); await failed;
  assert.equal(calls.toasts.at(-1).title, '加载订单失败'); assert.equal(page.data.loading, false);
  page.onPullDownRefresh(); assert.equal(calls.lists.length, 2); assert.equal(calls.requests.length, 0);
  calls.lists[1].resolve({ code: 200, data: { list: [] } });
  await new Promise(resolve => setImmediate(resolve));
});

test('actual API wrapper delivers a region failure to detail without a successful take', () => {
  const { harness } = require('./helpers/contentHarness');
  const h = harness(); h.login();
  const page = h.page('pages/order/detail/detail.js'); page.data.orderId = '10';
  page.acceptOrder(); h.calls.modal.at(-1).success({ confirm: true });
  h.calls.request[0].success(failure());
  assert.equal(page.data.takeBlocked, true);
  assert.equal(h.calls.toast.some(item => item.title === '接单成功'), false);
  h.calls.modal.at(-1).success({ confirm: true });
  assert.equal(h.calls.switchTab.at(-1).url, '/pages/index/index');
});
test('actual OrderAPI results cannot restore the pre-change home list after a new refresh', async () => {
  const { harness } = require('./helpers/contentHarness');
  const h = harness(); h.login();
  const page = h.page('pages/index/index.js');
  const first = page.loadNearbyOrders(), second = page.loadNearbyOrders();
  h.respond(1, { list: [] }); await second;
  h.respond(0, { list: [{ id: 'old' }] }); await first;
  assert.equal(page.data.nearbyOrders.length, 0);
});
