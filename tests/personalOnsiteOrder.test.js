const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { harness } = require('./helpers/contentHarness');
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const address = { id: 2, province: '测试省', city: '测试市', district: '测试区', detail_address: '测试路1号', contact_name: '测试用户', contact_phone: '13900000111' };
const order = extra => ({ id: 10, order_type: 'personal_quick', service_mode: 'on_site', required_cert_type: 'construction', electricity_type: 'industrial', status: 'pending_payment', prepay_amount: '28.50', ...extra });
async function create() {
  const h = harness(); h.login('user');
  const p = h.page('pages/order/create/create.js'); p.onLoad({ referrerId: '9' }); p.onShow();
  h.respond(h.calls.request.findIndex(r => r.url.includes('/addresses?page=')), { addresses: [address], pagination: { total: 1, pages: 1 } });
  h.respond(h.calls.request.findIndex(r => r.url.endsWith('/addresses/default')), { address });
  await flush(); p.setData({ description: '测试内容', requiredCertType: 'construction' }); p.updateSubmitEnable();
  return { h, p };
}
function payment(extra = {}, options = {}) {
  const h = harness(); h.login('user');
  h.app.globalData.paymentMethod = 'test';
  const api = h.load('utils/api.js').PaymentAPI;
  let posts = 0;
  api.createPayment = async body => { posts++; return { code: 200, data: { success: true, payment_no: 'isolated-pay', amount: 28.5, body } }; };
  api.confirmTestPayment = async () => ({ code: 200 });
  api.queryPayment = async () => ({ code: 200, data: { status: 'success' } });
  const p = h.page('pages/payment/payment/payment.js'); p.onLoad({ orderId: '10', ...options });
  h.respond(0, { order: order(extra) });
  return { h, p, api, posts: () => posts };
}

test('personal generation needs explicit qualification, not pre-generation agreement', async () => {
  const { h, p } = await create();
  assert.equal(p.data.agreePrepayTerms, false); assert.equal(p.data.hasOpenedAgreement, false); assert.equal(p.data.canSubmit, true);
  p.setData({ requiredCertType: '' }); p.updateSubmitEnable(); assert.equal(p.data.canSubmit, false);
  await p.submitOrder(); assert.equal(h.calls.request.filter(r => r.url.endsWith('/orders')).length, 0);
});

test('M6.1 personal offsite retains the draft and can return to onsite', async () => {
  const { h, p } = await create(); p.onServiceModeChange({ detail: { value: 'off_site' } });
  assert.equal(p.data.canSubmit, true); assert.equal(p.data.description, '测试内容');
  p.onServiceModeChange({ detail: { value: 'on_site' } }); assert.equal(p.data.canSubmit, true);
});

test('generation saves independent fields and shows the saved amount without payment navigation', async () => {
  const { h, p } = await create(); await p.submitOrder(); await p.submitOrder();
  const posts = h.calls.request.filter(r => r.method === 'POST' && r.url.endsWith('/orders'));
  assert.equal(posts.length, 1); assert.equal(posts[0].data.service_mode, 'on_site'); assert.equal(posts[0].data.required_cert_type, 'construction');
  assert.equal(posts[0].data.electricity_type, 'residential'); assert.equal(posts[0].data.referrerId, 9); assert.equal(posts[0].data.isDirected, false);
  posts[0].success({ statusCode: 200, data: { code: 200, data: { id: 10, prepay_amount: '28.50' } } });
  assert.equal(p.data.showPrepay, true); assert.equal(p.data.createdPrepayAmount, '28.50'); assert.equal(h.calls.navigate.length, 0);
  await p.submitOrder(); assert.equal(h.calls.request.filter(r => r.method === 'POST' && r.url.endsWith('/orders')).length, 1);
  p.closePersonalPrepay(); assert.equal(h.calls.redirect.at(-1).url, '/pages/order/detail/detail?id=10');
});

test('unknown creation result and malformed successful response cannot silently create another order', async () => {
  for (const malformed of [false, true]) {
    const { h, p } = await create(); await p.submitOrder(); const post = h.calls.request.find(r => r.url.endsWith('/orders'));
    if (malformed) post.success({ data: { code: 200, data: {} } }); else post.fail({});
    assert.equal(p.data.submissionUncertain, true); await p.submitOrder();
    assert.equal(h.calls.request.filter(r => r.method === 'POST' && r.url.endsWith('/orders')).length, 1);
  }
});

test('server failure after a possible commit is treated as unknown instead of safe to recreate', async () => {
  const { h, p } = await create(); await p.submitOrder();
  h.calls.request.find(r => r.url.endsWith('/orders')).success({ statusCode: 500, data: { code: 500, message: 'write result unknown' } });
  assert.equal(p.data.submissionUncertain, true); await p.submitOrder();
  assert.equal(h.calls.request.filter(r => r.method === 'POST' && r.url.endsWith('/orders')).length, 1);
});

test('image upload failure and hidden page after upload cannot issue a creation request', async () => {
  const { h, p } = await create(); p.setData({ images: ['local-file'] });
  p.uploadImage = async () => { throw new Error('upload failed'); }; await p.submitOrder();
  assert.equal(p.data.submitting, false); assert.equal(h.calls.request.some(r => r.method === 'POST'), false);
  let resume; p.uploadImage = () => new Promise(resolve => { resume = resolve; }); const pending = p.submitOrder();
  p.onHide(); resume('uploaded'); await pending; assert.equal(h.calls.request.some(r => r.method === 'POST'), false);
});

test('hidden or changed session cannot turn a delayed creation into payment navigation', async () => {
  const { h, p } = await create(); await p.submitOrder(); p.onHide();
  h.calls.request.find(r => r.url.endsWith('/orders')).success({ data: { code: 200, data: { id: 10, prepay_amount: 28.5 } } });
  assert.equal(p.data.showPrepay, false); p.confirmPersonalPrepay(); assert.equal(h.calls.redirect.length, 0);
  p.onShow(); assert.equal(p.data.showPrepay, true); h.app.globalData.userInfo.id = 33;
  p.confirmPersonalPrepay(); assert.equal(h.calls.redirect.length, 0);
});

test('one-time consent is account-bound, order-bound and cannot come from a URL', () => {
  const h = harness(); h.login('user'); const consent = h.load('utils/personalOrder.js');
  consent.grant(h.app, 10); assert.equal(consent.consume(h.app, 11), false); assert.equal(consent.consume(h.app, 10), false);
  consent.grant(h.app, 10); h.app._orderSessionVersion = 2; assert.equal(consent.consume(h.app, 10), false);
  consent.grant(h.app, 10); assert.equal(consent.consume(h.app, 10), true); assert.equal(consent.consume(h.app, 10), false);
  const { p, posts } = payment({}, { prepay_agreed: 'true', type: 'repair' });
  assert.equal(posts(), 0); assert.equal(p.data.showPrepay, true); assert.equal(p.data.payType, 'prepay');
});

test('component requires opening plus active checking and emits confirmation only once', () => {
  let definition;
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../components/order-prepay/index.js'), 'utf8'), {
    require: () => [], Component: value => { definition = value; }
  });
  const events = [], c = { ...definition.methods, data: { ...definition.data }, setData(values) { Object.assign(this.data, values); }, triggerEvent: name => events.push(name) };
  c.confirm(); assert.equal(events.length, 0);
  c.read(); assert.equal(c.data.agreed, false); c.closeReader(); c.confirm(); assert.equal(events.length, 0);
  c.changeAgreement({ detail: { value: ['agree'] } }); c.confirm(); c.confirm(); assert.deepEqual(events, ['confirm']);
  definition.properties.visible.observer.call(c, true); assert.equal(c.data.agreed, false); assert.equal(c.data.opened, false);
});

test('new personal payment waits for the modal and backend state after test confirmation', async () => {
  const { h, p, api, posts } = payment();
  assert.equal(p.data.showPrepay, true); assert.equal(posts(), 0);
  let body; const createPayment = api.createPayment; api.createPayment = async value => { body = value; return createPayment(value); };
  p.confirmPrepay(); await flush(); assert.equal(posts(), 1); assert.equal(body.prepay_agreed, true);
  assert.equal(h.calls.redirect.length, 0); // 确认接口返回成功也必须核实原单状态。
  h.respond(1, { order: order({ status: 'pending', has_paid_prepay: true }) });
  assert.match(h.calls.redirect.at(-1).url, /status=success/);
});

test('a stale prepayment entry cannot silently start a later repair charge', () => {
  const { h, posts } = payment({ status: 'pending_repair_payment', final_amount: 300 });
  assert.equal(posts(), 0); assert.equal(h.calls.redirect.at(-1).url, '/pages/order/detail/detail?id=10');
});

test('payment query exhaustion and network failures never report success', () => {
  const { h, p } = payment(); p.queryOrderStatus(10, 10, 1, () => {});
  h.calls.request.at(-1).fail({}); assert.equal(p.data.unknownResult, true); assert.equal(h.calls.redirect.length, 0);
});

test('late success after cancellation goes to the actual order instead of a payment success page', async () => {
  const { h, p } = payment(); p.confirmPrepay(); await flush();
  h.respond(1, { order: order({ status: 'cancelled', has_paid_prepay: true }) });
  assert.equal(h.calls.redirect.at(-1).url, '/pages/order/detail/detail?id=10');
});

test('test confirmation failure has no success and keeps the same order for query', async () => {
  const { h, p, api } = payment(); api.confirmTestPayment = async () => ({ code: 500, message: 'not confirmed' });
  p.confirmPrepay(); await flush(); assert.equal(h.calls.redirect.length, 0); assert.equal(p.data.orderId, '10'); assert.equal(p.data.unknownResult, true);
});

test('hiding after payment creation prevents a delayed response from launching test confirmation', async () => {
  const { p, api } = payment(); let reply, confirmations = 0;
  api.createPayment = () => new Promise(resolve => { reply = resolve; });
  api.confirmTestPayment = async () => { confirmations++; return { code: 200 }; };
  p.confirmPrepay(); await flush(); p.onHide();
  reply({ code: 200, data: { success: true, payment_no: 'isolated-pay' } }); await flush();
  assert.equal(confirmations, 0); assert.equal(p.data.unknownResult, true);
});

test('a qualification rejection uses the existing blocked-action and refresh feedback', () => {
  const h = harness(); h.login(); const p = h.page('pages/order/detail/detail.js'); p.setData({ orderId: 10, order: order({ status: 'pending' }) });
  p.acceptOrder(); h.calls.modal.at(-1).success({ confirm: true });
  h.calls.request.at(-1).success({ statusCode: 403, data: { code: 403, data: { reason: 'ORDER_QUALIFICATION_MISMATCH' } } });
  const requests = h.calls.request.length; p.acceptOrder();
  assert.equal(h.calls.request.length, requests); assert.match(h.calls.modal.at(-1).content, /有效证书不匹配/);
});

test('new personal detail routes to the agreement page while legacy and repair are not classified as new prepay', async () => {
  const h = harness(); h.login('user'); const p = h.page('pages/order/detail/detail.js');
  p.setData({ orderId: 10, order: order() }); await p.goToPay();
  assert.equal(h.calls.navigate.at(-1).url, '/pages/payment/payment/payment?orderId=10');
  assert.equal(h.calls.request.length, 0);
  const model = h.load('utils/personalOrder.js');
  assert.equal(model.isExplicit(order({ service_mode: null, required_cert_type: null })), false);
  assert.equal(model.isExplicit(order({ order_type: 'enterprise_quick', service_mode: null, required_cert_type: null })), false);
});

test('sharing retains recommendation and routes anonymous visitors through phone login', () => {
  const h = harness(); const page = h.page('pages/order-landing/index.js'); page.onLoad({ referrer_id: '9' });
  assert.equal(h.calls.redirect.at(-1).url, '/pages/login/login?entry=personal-order&referrerId=9');
  assert.equal(h.calls.request.length, 0);
  const logged = harness(); logged.login('user'); logged.page('pages/order-landing/index.js').onLoad({ scene: 'referrer_id%3D9' });
  assert.equal(logged.calls.redirect.at(-1).url, '/pages/order/create/create?referrerId=9');
});

test('direct anonymous creation redirects once to phone login and never loads addresses', () => {
  const h = harness(); const p = h.page('pages/order/create/create.js');
  p.onLoad({ referrerId: '9' }); p.onShow();
  assert.equal(h.calls.redirect.at(-1).url, '/pages/login/login?entry=personal-order&referrerId=9');
  assert.equal(h.calls.relaunch.length, 0); assert.equal(h.calls.request.length, 0);
});

test('share login carries the referral only into the resulting personal order, cancelling clears it', async () => {
  const h = harness(); const p = h.page('pages/login/login.js'); p.onLoad({ entry: 'personal-order', referrerId: '9' });
  assert.equal(p.data.showLoginForm, true); assert.equal(p._orderRequested, true);
  h.wx.login = async () => ({});
  h.load('utils/api.js').AuthAPI.login = async () => ({ data: { user: { id: 2, phone: '13900000111', current_role: 'user' }, token: 'isolated' } });
  p.setData({ phone: '13900000111', code: '123456' }); await p.onAgree(); h.timers.forEach(fn => fn());
  assert.equal(h.calls.relaunch.at(-1).url, '/pages/order/create/create?referrerId=9');
  const cancelled = harness(); const q = cancelled.page('pages/login/login.js'); q.onLoad({ entry: 'personal-order', referrerId: '9' });
  q.closeLoginForm(); assert.equal(q._orderRequested, false); assert.equal(q._orderReferrerId, null);
});

test('agreement matches every nonempty source paragraph, with no substituted legacy text', () => {
  const file = path.resolve(__dirname, '../../docs/requirements/v1.2.0/协议政策/1.2.1订单预约服务预付款协议(新).md');
  const source = fs.readFileSync(file, 'utf8').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  assert.deepEqual(require('../config/prepay-agreement'), source);
});

test('new and historical display fields never infer qualification from electricity type', () => {
  const h = harness(); const model = h.load('utils/personalOrder.js');
  assert.equal(model.labels(order()).electricityTypeName, '工商业用电'); assert.equal(model.labels(order()).requiredCertName, '建筑电工');
  assert.equal(model.labels({ electricity_type: 'residential' }).requiredCertName, '未记录');
});
