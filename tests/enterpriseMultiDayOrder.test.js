const test = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./helpers/contentHarness');
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
const address = { id: 2, province: '测试省', city: '测试市', district: '认证区', detail_address: '测试路1号', contact_name: '联系人', contact_phone: '13900000111' };
async function create() {
  const h = harness(); h.login('enterprise'); let title;
  h.wx.setNavigationBarTitle = value => { title = value.title; };
  const p = h.page('pages/order/create/create.js'); p.onLoad({}); p.onShow();
  h.respond(0, { certStatus: 'approved', district: '认证区' });
  h.respond(h.calls.request.findIndex(r => r.url.includes('/addresses?page=')), { addresses: [address], pagination: { total: 1, pages: 1 } });
  h.respond(h.calls.request.findIndex(r => r.url.endsWith('/addresses/default')), { address });
  await flush(); p.setData({ description: '建筑工程服务内容', requiredCertType: 'construction' }); p.updateSubmitEnable();
  return { h, p, title };
}
function count(p, value) { p.onEnterpriseCountChange({ detail: { value: value - 1 } }); }

test('enterprise offsite projects show their actual status in My Orders', () => {
  const cases = [
    ['recruiting', '招募中'], ['full', '名额已满'], ['reviewing', '评价中'],
    ['cancel_pending', '取消处理中'], ['unexpected_status', '待平台核对']
  ];
  for (const pricing_mode of ['fixed_price', 'fixed_deposit']) {
    const h = harness();
    h.login('enterprise');
    const page = h.page('pages/order/list/list.js');
    page.loadOrders();
    h.respond(0, { list: cases.map(([status], index) => ({
      id: index + 1, order_type: 'enterprise_project', service_mode: 'off_site', pricing_mode, status
    })) });
    assert.deepEqual(Array.from(page.data.orders, order => order.statusText), cases.map(([, label]) => label));
  }
});
function dates(p, start = '2090-01-01', end = '2090-01-02') {
  p.openProjectDates(); p.onProjectDraftDate({ currentTarget: { dataset: { field: 'draftStartDate' } }, detail: { value: start } });
  p.onProjectDraftDate({ currentTarget: { dataset: { field: 'draftEndDate' } }, detail: { value: end } }); p.confirmProjectDates();
}
async function ready() { const f = await create(); count(f.p, 2); dates(f.p); f.p.onProjAmountInput({ detail: { value: '1000.00' } }); return f; }
test('one-person default has enterprise title and disabled date action; choosing count requires explicit date confirmation', async () => {
  const { p, title } = await create(); assert.equal(title, '创建企业订单'); assert.equal(p.data.enterpriseCount, 1); assert.equal(p.data.canSubmit, true);
  p.openProjectDates(); assert.equal(p.data.showProjectDates, false);
  count(p, 2); assert.equal(p.data.canSubmit, false); assert.equal(p.data.showProjectDates, false);
  dates(p); assert.equal(p.data.projectDateConfirmed, true); assert.match(p.data.projectDateSummary, /共2天/);
  p.onProjAmountInput({ detail: { value: '1000' } }); assert.equal(p.data.canSubmit, true); assert.equal(p.data.projElectricianFee, '425.00');
});
test('date cancellation restores one person and preserves shared draft, address, images and qualification', async () => {
  const { p } = await ready(); p.setData({ images: ['local-test.jpg'] }); p.openProjectDates(); p.cancelProjectDates();
  assert.equal(p.data.enterpriseCount, 1); assert.equal(p.data.orderMode, 'quick'); assert.equal(p.data.projectDateConfirmed, false);
  assert.equal(p.data.projTotalAmount, ''); assert.equal(p.data.description, '建筑工程服务内容'); assert.equal(p.data.selectedAddress.id, 2);
  assert.equal(p.data.requiredCertType, 'construction'); assert.deepEqual(Array.from(p.data.images), ['local-test.jpg']); assert.equal(p.data.canSubmit, true);
});
test('changing confirmed headcount invalidates dates; hundred-person and twenty-nine-day boundaries are supported', async () => {
  const { p } = await ready(); count(p, 100); assert.equal(p.data.projectDateConfirmed, false); assert.equal(p.data.canSubmit, false);
  assert.equal(p.data.projElectricianFee, '8.50');
  dates(p, '2090-01-01', '2090-01-29'); assert.match(p.data.projectDateSummary, /共29天/); assert.equal(p.data.canSubmit, true);
  dates(p, '2090-01-01', '2090-01-30'); assert.equal(p.data.showProjectDates, true); assert.match(p.data.projectDateError, /2至29天/);
});
test('invalid dates do not close the dialog and China natural days are independent of device timezone', async () => {
  const { h, p } = await create(); count(p, 2);
  for (const [start, end] of [['2090-01-01', '2090-01-01'], ['2090-01-02', '2090-01-01'], ['2090-02-29', '2090-03-02'], ['2020-01-01', '2020-01-02']]) {
    dates(p, start, end); assert.equal(p.data.showProjectDates, true); assert.equal(p.data.canSubmit, false);
  }
  const model = h.load('utils/projectOrder.js'); assert.equal(model.today(new Date('2026-11-17T16:01:00Z')), '2026-11-18');
  assert.equal(model.days('2028-02-28', '2028-02-29'), 2); assert.equal(model.days('2090-12-31', '2091-01-01'), 2);
});
test('an outside-district single address is retained but blocks project creation and works again after cancelling', async () => {
  const { p } = await create(); p.setData({ enterpriseCertDistrict: '另一区' }); count(p, 2); dates(p); p.onProjAmountInput({ detail: { value: '100' } });
  assert.equal(p.data.selectedAddress.id, 2); assert.equal(p.data.canSubmit, false); p.openProjectDates(); p.cancelProjectDates(); assert.equal(p.data.canSubmit, true);
});
test('project generation uploads shared images, saves original total in modal and never automatically navigates to payment', async () => {
  const { h, p } = await ready(); p.setData({ images: ['local.jpg'] }); p.uploadImage = async () => '/uploads/order/shared.jpg';
  await p.submitOrder(); await p.submitOrder();
  const posts = h.calls.request.filter(r => r.method === 'POST'); assert.equal(posts.length, 1); const post = posts[0];
  assert.match(post.url, /\/miniprogram\/enterprise\/orders\/project$/); assert.equal(post.data.projRequiredCount, 2);
  assert.equal(post.data.projStartDate, '2090-01-01'); assert.equal(post.data.projEndDate, '2090-01-02'); assert.equal(post.data.required_cert_type, 'construction');
  assert.equal('electricity_type' in post.data, false); assert.equal(post.data.images[0], '/uploads/order/shared.jpg');
  post.success({ statusCode: 200, data: { code: 200, data: { id: 10, prepay_amount: 1000 } } });
  assert.equal(p.data.createdIsProject, true); assert.equal(p.data.createdPrepayAmount, '1000.00'); assert.equal(p.data.showPrepay, true); assert.equal(h.calls.navigate.length, 0);
  count(p, 1); assert.equal(p.data.enterpriseCount, 2); p.confirmPersonalPrepay(); assert.equal(h.calls.redirect.at(-1).url, '/pages/payment/payment/payment?orderId=10');
});
test('project 5xx or malformed creation result cannot be bypassed by changing count', async () => {
  for (const response of [{ statusCode: 500, data: { code: 500 } }, { statusCode: 200, data: { code: 200, data: { id: 10 } } }]) {
    const { h, p } = await ready(); await p.submitOrder(); h.calls.request.find(r => r.method === 'POST').success(response);
    assert.equal(p.data.submissionUncertain, true); count(p, 1); await p.submitOrder(); assert.equal(h.calls.request.filter(r => r.method === 'POST').length, 1);
  }
});
test('project image upload failures, hidden page and invalid fee never issue create request', async () => {
  const first = await ready(); first.p.setData({ images: ['bad.jpg'] }); first.p.uploadImage = async () => { throw new Error('upload failed'); }; await first.p.submitOrder();
  assert.equal(first.h.calls.request.some(r => r.method === 'POST'), false);
  const second = await ready(); second.p.onHide(); await second.p.submitOrder(); assert.equal(second.h.calls.request.some(r => r.method === 'POST'), false);
  const third = await ready(); for (const value of ['1.001', '0', 'Infinity', '2foo', '10000000000']) { third.p.onProjAmountInput({ detail: { value } }); assert.equal(third.p.data.canSubmit, false); }
});
test('offsite project creates the deposit contract without an upfront service fee', async () => {
  const { h, p } = await ready(); p.onServiceModeChange({ detail: { value: 'off_site' } }); await p.submitOrder();
  const request = h.calls.request.find(r => r.method === 'POST');
  assert.equal(request.data.pricing_mode,'fixed_deposit');
  assert.equal(request.data.projTotalAmount,undefined);
  assert.ok(request.data.request_key);
});
test('direct new-project payment requires consent and confirms actual recruiting state after test payment', async () => {
  const h = harness(); h.login('enterprise'); h.app.globalData.paymentMethod = 'test'; let payload;
  const api = h.load('utils/api.js').PaymentAPI; api.createPayment = async body => { payload = body; return { code: 200, data: { success: true, payment_no: 'isolated', amount: 1000 } }; };
  api.confirmTestPayment = async () => ({ code: 200 }); api.queryPayment = async () => ({ code: 200, data: { status: 'success' } });
  const order = { id: 10, order_type: 'enterprise_project', service_mode: 'on_site', required_cert_type: 'construction', prepay_amount: 1000, status: 'pending_payment' };
  const p = h.page('pages/payment/payment/payment.js'); p.onLoad({ orderId: '10' }); h.respond(0, { order });
  assert.equal(payload, undefined); assert.equal(p.data.projectPrepay, true); assert.equal(p.data.showPrepay, true);
  p.confirmPrepay(); await flush(); assert.equal(payload.prepay_agreed, true); assert.equal(h.calls.redirect.length, 0);
  h.respond(1, { order: { ...order, status: 'recruiting', has_paid_prepay: true } }); assert.match(h.calls.redirect.at(-1).url, /status=success/);
});
test('new project details map China calendar dates and construction; old projects keep historical identity', () => {
  const model = harness().load('utils/personalOrder.js');
  const order = { order_type: 'enterprise_project', service_mode: 'on_site', required_cert_type: 'construction', proj_start_time: '2089-12-31T16:00:00Z', proj_end_time: '2090-01-02T15:59:59Z' };
  const labels = model.labels(order); assert.equal(labels.isNewProject, true); assert.equal(labels.isNewEnterprise, true);
  assert.equal(labels.projectStartDateName, '2090年01月01日'); assert.equal(labels.projectEndDateName, '2090年01月02日');
  assert.equal(model.labels({ ...order, service_mode: null, required_cert_type: null }).isNewProject, false);
});

test('project review page submits the displayed stage and guards duplicate clicks until the response', () => {
  const h = harness(); h.login('enterprise'); const p = h.page('pages/enterprise/project-review/project-review.js');
  p.onLoad({ orderId: '10' }); h.respond(0, { list: [{ electricianId: 7, status: 'pending_review' }], orderStatus: 'reviewing' });
  const event = { currentTarget: { dataset: { id: 7 } } }; p.setData({ ratings: { 7: 3 } });
  p.submitReview(event); p.submitReview(event); const posts = h.calls.request.filter(r => r.method === 'POST');
  assert.equal(posts.length, 1); assert.equal(posts[0].data.reviewStage, 'pending_review');
});

test('enterprise single and project share multi-select options, while personal selection remains scalar', async () => {
  const { h, p } = await create();
  p.onEnterpriseCertChange({ detail: { value: ['construction', 'low_voltage', 'high_voltage'] } });
  assert.equal(p.data.requiredCertType, 'low_voltage,high_voltage,construction');
  assert.equal(p.data.enterpriseLowChecked, true); assert.equal(p.data.enterpriseHighChecked, true); assert.equal(p.data.enterpriseConstructionChecked, true);
  assert.equal(p.data.canSubmit, true);
  const model = h.load('utils/personalOrder.js');
  assert.equal(model.labels({ order_type: 'enterprise_quick', service_mode: 'on_site', required_cert_type: p.data.requiredCertType }).requiredCertName, '低压电工 / 高压电工 / 建筑电工');
  assert.equal(model.labels({ order_type: 'personal_quick', service_mode: 'on_site', required_cert_type: p.data.requiredCertType }).requiredCertName, '未记录');
  p.onEnterpriseCertChange({ detail: { value: [] } }); assert.equal(p.data.canSubmit, false);
  p.onEnterpriseCertChange({ detail: { value: ['construction', 'low_voltage'] } }); count(p, 100); dates(p); p.onProjAmountInput({ detail: { value: '1000' } });
  assert.equal(p.data.enterpriseCountRange.length, 100); assert.equal(p.data.canSubmit, true);
  await p.submitOrder(); const post = h.calls.request.find(r => r.method === 'POST');
  assert.equal(post.data.projRequiredCount, 100); assert.equal(post.data.required_cert_type, 'low_voltage,construction');
});

test('enterprise project prepayment binds the chosen amount and confirmed version to its original order', async () => {
  const h = harness();
  h.login('enterprise');
  const events = [];
  const widget = {
    ...h.component('components/order-prepay/index.js'),
    data:{orderId:10, offsite:true, project:true, sharedLayout:true, projectPrice:{deposit:'600.00',priceRevision:0}, opened:false, agreed:false},
    setData(value) { Object.assign(this.data,value); },
    triggerEvent(name,detail) { events.push({name,detail}); }
  };
  await widget.confirm();
  assert.equal(h.calls.request.length,0);
  widget.changeAgreement({detail:{value:['agree']}});
  widget.inputSharedPrice({detail:{value:'100.00'}});
  widget.inputSharedPrice({detail:{value:''}});
  assert.equal(widget.data.mode, 'fixed_deposit');
  widget.inputSharedPrice({detail:{value:'100.00'}});
  assert.equal(widget.data.agreed, true);
  const work = widget.confirm();
  const selection = h.calls.request[0];
  assert.match(selection.url,/orders\/10\/project-billing\/price$/);
  assert.deepEqual(JSON.parse(JSON.stringify(selection.data)),{pricing_mode:'fixed_price',amount:'100.00',prepay_agreed:true,price_revision:0});
  h.respond(0,{pricing_mode:'fixed_price',price_revision:1,amount:100});
  await work;
  assert.equal(events[0].detail.priceRevision,1);

  h.app.globalData.paymentMethod='test';
  h.load('utils/personalOrder.js').grant(h.app,10,events[0].detail);
  const payment = h.page('pages/payment/payment/payment.js');
  const api = h.load('utils/api.js').PaymentAPI;
  let body;
  api.createPayment = async value => {body=value;return {code:400,message:'isolated'};};
  payment.onLoad({orderId:'10'});
  h.respond(1,{order:{id:10,order_type:'enterprise_project',service_mode:'off_site',required_cert_type:'construction',
    pricing_mode:'fixed_price',status:'pending_payment',prepay_amount:100,project_billing:{deposit:600,priceRevision:1,pricingMode:'fixed_price'}}});
  await flush();
  assert.equal(body.pricing_mode,'fixed_price');
  assert.equal(body.price_revision,1);
  assert.equal(body.agreed_amount,'100.00');
  assert.equal(body.type,'prepay');
});
