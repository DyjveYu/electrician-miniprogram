const test = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./helpers/contentHarness');
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const address = { id: 2, province: '省', city: '市', district: '其他区', detail_address: '测试路1号', contact_name: '企业联系人', contact_phone: '13900000111' };
const order = extra => ({ id: 10, order_type: 'enterprise_quick', service_mode: 'on_site', required_cert_type: 'construction', electricity_type: null, status: 'pending_payment', prepay_amount: '28.50', ...extra });
async function create() {
  const h = harness(); h.login('enterprise');
  const p = h.page('pages/order/create/create.js'); p.onLoad({ referrerId: '9' }); p.onShow();
  h.respond(0, { certStatus: 'approved', district: '认证区' });
  h.respond(h.calls.request.findIndex(r => r.url.includes('/addresses?page=')), { addresses: [address], pagination: { total: 1, pages: 1 } });
  h.respond(h.calls.request.findIndex(r => r.url.endsWith('/addresses/default')), { address });
  await flush(); p.setData({ description: '企业服务内容', requiredCertType: 'construction' }); p.updateSubmitEnable();
  return { h, p };
}
function pay(extra = {}) {
  const h = harness(); h.login('enterprise'); h.app.globalData.paymentMethod = 'test';
  const api = h.load('utils/api.js').PaymentAPI;
  let posted = [];
  api.createPayment = async body => { posted.push(body); return { code: 200, data: { success: true, payment_no: 'isolated-enterprise', amount: 28.5 } }; };
  api.confirmTestPayment = async () => ({ code: 200 });
  api.queryPayment = async () => ({ code: 200, data: { status: 'success' } });
  const p = h.page('pages/payment/payment/payment.js'); p.onLoad({ orderId: '10' });
  h.respond(0, { order: order(extra) });
  return { h, p, api, posted };
}

test('enterprise defaults to single onsite without pre-generation agreement, and accepts an address outside its certification district', async () => {
  const { p } = await create();
  assert.equal(p.data.orderMode, 'quick'); assert.equal(p.data.serviceMode, 'on_site'); assert.equal(p.data.canSubmit, true);
  assert.notEqual(p.data.selectedAddress.district, p.data.enterpriseCertDistrict);
  assert.equal(p.data.hasOpenedAgreement, false); assert.equal(p.data.agreePrepayTerms, false);
  p.setData({ requiredCertType: '' }); p.updateSubmitEnable(); assert.equal(p.data.canSubmit, false);
});

test('enterprise onsite generation sends independent qualification and no electricity type, then shows original saved amount', async () => {
  const { h, p } = await create(); await p.submitOrder(); await p.submitOrder();
  const posts = h.calls.request.filter(r => r.method === 'POST' && r.url.endsWith('/orders'));
  assert.equal(posts.length, 1); assert.equal(posts[0].data.required_cert_type, 'construction'); assert.equal(posts[0].data.service_mode, 'on_site');
  assert.equal('electricity_type' in posts[0].data, false); assert.equal(posts[0].data.address_id, 2); assert.equal(posts[0].data.isDirected, false);
  posts[0].success({ statusCode: 200, data: { code: 200, data: { id: 10, prepay_amount: 28.5 } } });
  assert.equal(p.data.showPrepay, true); assert.equal(p.data.createdPrepayAmount, '28.50'); assert.equal(h.calls.navigate.length, 0);
  p.closePersonalPrepay(); assert.equal(h.calls.redirect.at(-1).url, '/pages/order/detail/detail?id=10');
});

test('enterprise single offsite submits its own address and qualifications', async () => {
  const { h, p } = await create();
  p.onServiceModeChange({ detail: { value: 'off_site' } });
  assert.equal(p.data.canSubmit,true);
  await p.submitOrder();
  const paymentDraft = h.calls.request.find(r => r.method === 'POST' && r.url.endsWith('/orders')).data;
  assert.equal(paymentDraft.pricing_mode,'fixed_deposit');
  assert.equal(paymentDraft.service_mode,'off_site');
  assert.ok(paymentDraft.address_id && paymentDraft.required_cert_type);
});

test('enterprise creation server errors are unknown results and do not allow a second order', async () => {
  const { h, p } = await create(); await p.submitOrder();
  h.calls.request.find(r => r.method === 'POST' && r.url.endsWith('/orders')).success({ statusCode: 500, data: { code: 500 } });
  assert.equal(p.data.submissionUncertain, true); await p.submitOrder();
  assert.equal(h.calls.request.filter(r => r.method === 'POST' && r.url.endsWith('/orders')).length, 1);
});

test('late profile return after a known creation cannot redirect the stored order away from payment', async () => {
  const { h, p } = await create(); await p.submitOrder();
  h.calls.request.find(r => r.method === 'POST' && r.url.endsWith('/orders')).success({ statusCode: 200, data: { code: 200, data: { id: 10, prepay_amount: 28.5 } } });
  assert.equal(p.handleReturnedProfile({ data: { reason: 'ENTERPRISE_PROFILE_RETURNED', returnReason: '重新提交' } }), false);
  p.onHide(); const count = h.calls.request.length; p.onShow();
  assert.equal(h.calls.request.length, count); assert.equal(p.data.showPrepay, true);
  p.confirmPersonalPrepay(); assert.equal(h.calls.redirect.at(-1).url, '/pages/payment/payment/payment?orderId=10');
});

test('missing or returned profile before creation uses the existing certification continuation', async () => {
  for (const reason of ['ENTERPRISE_CERTIFICATION_REQUIRED', 'ENTERPRISE_PROFILE_RETURNED']) {
    const { h, p } = await create(); assert.equal(p.handleReturnedProfile({ data: { reason, returnReason: '缺少资料' } }), true);
    h.calls.modal.at(-1).success({ confirm: true });
    assert.match(h.calls.relaunch.at(-1).url, /^\/pages\/enterprise\/certification\/certification\?orderEntry=/);
    assert.equal(h.calls.request.some(r => r.method === 'POST'), false);
  }
});

test('new enterprise detail and direct payment entry both use the common agreement gate', async () => {
  const { h, p, posted } = pay(); assert.equal(posted.length, 0); assert.equal(p.data.showPrepay, true);
  p.confirmPrepay(); await flush(); assert.equal(posted.length, 1); assert.equal(posted[0].prepay_agreed, true);
  assert.equal(h.calls.redirect.length, 0);
  h.respond(1, { order: order({ status: 'pending', has_paid_prepay: true }) }); assert.match(h.calls.redirect.at(-1).url, /status=success/);
  const other = harness(); other.login('enterprise'); const detail = other.page('pages/order/detail/detail.js'); detail.setData({ orderId: 10, order: order() });
  await detail.goToPay(); assert.equal(other.calls.navigate.at(-1).url, '/pages/payment/payment/payment?orderId=10'); assert.equal(other.calls.request.length, 0);
});

test('enterprise legacy and project payments keep their old paths and have no new agreement gate', async () => {
  for (const extra of [{ service_mode: null, required_cert_type: null }, { order_type: 'enterprise_project', status: 'pending_payment', service_mode: null, required_cert_type: null }]) {
    const { p, posted } = pay(extra); await flush();
    assert.equal(p.data.showPrepay, false); assert.equal(posted.length, 1); assert.equal('prepay_agreed' in posted[0], false);
  }
});

test('registered landing detail displays explicit enterprise fields and sends prepayment through the common gate', async () => {
  const h = harness(); h.login('enterprise'); h.wx.stopPullDownRefresh = () => {};
  const p = h.page('pages/order-landing-detail/index.js'); p.onLoad({ id: '10' });
  h.respond(0, { order: order() });
  assert.equal(p.data.order.isNewEnterprise, true); assert.equal(p.data.order.requiredCertName, '建筑电工');
  await p.goToPay(); assert.equal(h.calls.navigate.at(-1).url, '/pages/payment/payment/payment?orderId=10');
  assert.equal(h.calls.request.length, 1);
});

test('enterprise unknown payment and late cancellation never report a success page', async () => {
  const { h, p } = pay(); p.queryOrderStatus(10, 10, 1, () => {}); h.calls.request.at(-1).fail({});
  assert.equal(p.data.unknownResult, true); assert.equal(h.calls.redirect.length, 0);
  const second = pay(); second.p.confirmPrepay(); await flush();
  second.h.respond(1, { order: order({ status: 'cancelled', has_paid_prepay: true }) });
  assert.equal(second.h.calls.redirect.at(-1).url, '/pages/order/detail/detail?id=10');
});

test('new enterprise rendering flags hide electricity type without erasing personal or historical values', () => {
  const model = harness().load('utils/personalOrder.js');
  assert.equal(model.labels(order()).isNewEnterprise, true); assert.equal(model.labels(order()).requiredCertName, '建筑电工');
  assert.equal(model.labels({ ...order(), order_type: 'personal_quick', electricity_type: 'industrial' }).isNewEnterprise, false);
  assert.equal(model.labels({ ...order(), service_mode: null, required_cert_type: null, electricity_type: 'industrial' }).electricityTypeName, '工商业用电');
  assert.equal(model.labels({ ...order(), service_mode: null, required_cert_type: null }).isNewEnterprise, false);
});

test('the old project switch still enforces its original district rule and returning to quick recovers single-form validation', async () => {
  const { p } = await create(); p.switchOrderMode({ currentTarget: { dataset: { mode: 'project' } } });
  assert.equal(p.data.orderMode, 'project'); assert.equal(p.data.selectedAddress.id, 2); assert.equal(p._addressUsable(p.data.selectedAddress), false);
  p._applyAddress(p._mapAddress({ ...address, district: '认证区' }));
  p.setData({ projStartDate: '2090-12-01', projEndDate: '2090-12-03', projectDateConfirmed: true, projTotalAmount: '300' });
  p.onDescriptionInput({ detail: { value: '原工程描述' } }); assert.equal(p.data.canSubmit, true);
  p.switchOrderMode({ currentTarget: { dataset: { mode: 'quick' } } }); assert.equal(p.data.canSubmit, true);
});
