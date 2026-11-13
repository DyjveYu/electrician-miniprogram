const test = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./helpers/contentHarness');
function start({ pending = false, notification = '' } = {}) {
  const h = harness();
  h.login('electrician', '13900000111');
  const page = h.page('pages/profile/certification/certification.js');
  page.onLoad(notification ? { step: '2', regionChangeId: notification } : {});
  h.respond(0, { user_id: 1, status: pending ? 'pending' : 'approved',
    region_change_pending_id: pending ? 5 : null, business_revision: 2,
    province: '北京市', city: '北京市', district: '东城区' });
  return { h, page };
}
const info = self => ({
  can_apply: true, can_self_change: self, self_change_count: self ? 0 : 3, business_revision: 2,
  subscribe_template_id: ''
});
function load(h, page, self = false) {
  page.setData({ activeStep: 2 });
  page.loadRegionChangeStatus();
  h.respond(h.calls.request.length - 1, info(self));
}
function target(h, page) {
  page.openRegionChange();
  page.selectTargetRegion({ detail: { value: ['广东省', '广州市', '天河区'] } });
  const quote = h.calls.request.at(-1);
  quote.success({ data: { success: true, data: { callout_fees: [30, 60, 90] } } });
  quote.complete();
}
test('manual requests require a reason and become a single pending application', () => {
  const { h, page } = start();
  load(h, page);
  target(h, page);
  page.submitRegionChange();
  assert.equal(h.calls.modal.length, 0);
  page.editRegionChangeReason({ detail: { value: '工作地点变化' } });
  page.submitRegionChange();
  h.calls.modal.at(-1).success({ confirm: true });
  const request = h.calls.request.at(-1);
  assert.equal(request.method, 'POST');
  assert.ok(request.url.endsWith('/region-change'));
  assert.equal(request.data.reason, '工作地点变化');
  assert.match(request.data.request_key, /^[a-f0-9-]{36}$/);
  assert.equal(request.data.business_revision, 2);
  request.success({ data: { code: 200, data: { status: 'pending' } } });
  request.complete();
  assert.equal(page.data.regionEditorOpen, false);
  assert.ok(h.calls.request.at(-1).url.endsWith('/certification/status'));
});
test('a retry after network failure keeps its idempotency key', () => {
  const { h, page } = start();
  load(h, page, true);
  target(h, page);
  page.submitRegionChange();
  h.calls.modal.at(-1).success({ confirm: true });
  const first = h.calls.request.at(-1);
  first.fail(); first.complete();
  page.submitRegionChange();
  h.calls.modal.at(-1).success({ confirm: true });
  assert.equal(h.calls.request.at(-1).data.request_key, first.data.request_key);
});
test('late fee responses cannot overwrite a new target', () => {
  const { h, page } = start();
  load(h, page);
  page.openRegionChange();
  page.selectTargetRegion({ detail: { value: ['广东省', '广州市', '天河区'] } });
  const old = h.calls.request.at(-1);
  page.selectTargetRegion({ detail: { value: ['上海市', '上海市', '黄浦区'] } });
  old.success({ data: { success: true, data: { callout_fees: [1, 2, 3] } } });
  assert.equal(page.data.targetRegionFees.length, 0);
});
test('region review pending disables the original reapplication path', () => {
  const { page } = start({ pending: true });
  page.reapplyCertification();
  assert.equal(page.data.mode, 'view');
  assert.equal(page.data.regionChangePending, true);
});
test('a notification opens the region tab and reads the specified result under the current account', () => {
  const { h, page } = start({ notification: '9' });
  assert.equal(page.data.activeStep, 2);
  assert.ok(h.calls.request.at(-1).url.endsWith('/region-change?change_id=9'));
});
test('a complete certification reload discards an older eligibility response', () => {
  const { h, page } = start();
  page.loadRegionChangeStatus();
  const old = h.calls.request.at(-1);
  page.loadCertificationInfo();
  old.success({ data: { code: 200, data: info(true) } });
  assert.equal(page.data.regionInfo, null);
});

test('manual application requests consent and submits a fresh WeChat login code', () => {
  const { h, page } = start();
  load(h, page);
  page.setData({ 'regionInfo.subscribe_template_id': 'review-template' });
  let consent;
  h.wx.requestSubscribeMessage = options => { consent = options; };
  h.wx.login = options => options.success({ code: 'fresh-code' });
  target(h, page);
  page.editRegionChangeReason({ detail: { value: '工作地点变化' } });
  page.submitRegionChange();
  h.calls.modal.at(-1).success({ confirm: true });
  assert.equal(consent.tmplIds[0], 'review-template');
  assert.equal(h.calls.request.at(-1).url.endsWith('/region-change'), false);
  consent.success({ 'review-template': 'accept' });
  const request = h.calls.request.at(-1);
  assert.equal(request.data.subscription_result, 'accept');
  assert.equal(request.data.notification_login_code, 'fresh-code');
  assert.equal(request.data.notification_template_id, 'review-template');
});

test('declining or failing consent still submits the manual application', () => {
  for (const decline of [true, false]) {
    const { h, page } = start();
    load(h, page);
    page.setData({ 'regionInfo.subscribe_template_id': 'review-template' });
    h.wx.requestSubscribeMessage = options => decline
      ? options.success({ 'review-template': 'reject' }) : options.fail();
    target(h, page);
    page.editRegionChangeReason({ detail: { value: '工作地点变化' } });
    page.submitRegionChange();
    h.calls.modal.at(-1).success({ confirm: true });
    const request = h.calls.request.at(-1);
    assert.equal(request.method, 'POST');
    assert.equal(request.data.subscription_result, decline ? 'reject' : 'unavailable');
    assert.equal(request.data.notification_login_code, undefined);
  }
});
