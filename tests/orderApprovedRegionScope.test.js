const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { harness } = require('./helpers/contentHarness');
const addition = { province: '广东省', city: '广州市', district: '海珠区' };

for (const type of ['personal_quick', 'enterprise_quick', 'enterprise_project']) {
  test('existing detail accepts a successful take from an approved added region: ' + type, () => {
    const h = harness(); h.login();
    const page = h.page('pages/order/detail/detail.js');
    page.setData({ orderId: '20', order: { id: 20, order_type: type, address: addition } });
    page.acceptOrder(); h.calls.modal.at(-1).success({ confirm: true });
    assert.equal(h.calls.request.length, 1); assert.ok(h.calls.request[0].url.endsWith('/orders/20/take'));
    h.respond(0, { message: '接单成功' });
    assert.equal(page.data.takeSucceeded, true); assert.equal(page.data.takeBlocked, false);
    assert.equal(h.calls.toast.at(-1).title, '接单成功');
    h.timers.forEach(callback => callback());
    assert.equal(h.calls.switchTab.at(-1).url, '/pages/order/list/list');
  });
}
test('an old added-region detail shows the existing failure message after that region exits', () => {
  const h = harness(); h.login();
  const page = h.page('pages/order/detail/detail.js');
  page.setData({ orderId: '20', order: { id: 20, address: addition } });
  page.acceptOrder(); h.calls.modal.at(-1).success({ confirm: true });
  h.respond(0, { reason: 'ORDER_OUTSIDE_BASE_REGION' }, 403);
  assert.equal(page.data.takeBlocked, true); assert.equal(page.data.taking, false);
  assert.match(h.calls.modal.at(-1).content, /不在您当前的接单区域/);
  assert.doesNotMatch(h.calls.modal.at(-1).content, /基础区域/);
  page.acceptOrder(); assert.equal(h.calls.request.length, 1);
  h.calls.modal.at(-1).success({ confirm: true });
  assert.equal(h.calls.switchTab.at(-1).url, '/pages/index/index');
});
test('a regional database failure cannot look like a successful added-region take', () => {
  const h = harness(); h.login();
  const page = h.page('pages/order/detail/detail.js'); page.setData({ orderId: '20' });
  page.acceptOrder(); h.calls.modal.at(-1).success({ confirm: true });
  h.respond(0, {}, 500);
  assert.equal(page.data.takeSucceeded, false); assert.equal(page.data.taking, false);
  assert.equal(h.calls.switchTab.length, 0);
  assert.equal(h.calls.toast.some(item => item.title === '接单成功'), false);
});
test('home renders the combined server list without applying its own base-only filter', async () => {
  let definition, params;
  const orders = [
    { id: 1, order_type: 'personal_quick', status: 'pending', address: { ...addition, district: '天河区' } },
    { id: 2, order_type: 'enterprise_quick', status: 'pending', address: addition },
    { id: 3, order_type: 'enterprise_project', status: 'recruiting', address: { ...addition, city: '深圳市', district: '南山区' } }
  ];
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../pages/index/index.js'), 'utf8'), {
    Page: value => { definition = value; }, getApp: () => ({ globalData: { currentRole: 'electrician' } }),
    console: { log() {}, warn() {}, error() {} }, wx: { showToast() {} },
    require: name => {
      if (name.endsWith('/api')) return { OrderAPI: { getOrderList: async value => { params = value; return { code: 200, data: { list: orders, total: 3 } }; } } };
      if (name.endsWith('/util')) return { getOrderStatusText: value => value, formatTime: value => value };
      if (name.endsWith('enterpriseSession')) return {};
      if (name.endsWith('orderSubscription')) return { load: async () => {}, subscribe() {}, hide() {} };
      throw new Error('Unexpected dependency: ' + name);
    }
  });
  const page = { ...definition, data: { ...definition.data }, setData(patch) { Object.assign(this.data, patch); } };
  await page.loadNearbyOrders();
  assert.equal(params.my_orders, false); assert.equal(page.data.loading, false);
  assert.deepEqual(Array.from(page.data.nearbyOrders, item => item.id), [1, 2, 3]);
  assert.equal(page.data.nearbyOrders[2].address.city, '深圳市');
});
