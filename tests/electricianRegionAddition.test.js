const test = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./helpers/contentHarness');
const base = { user_id: 1, status: 'approved', business_revision: 2,
  province: '北京市', city: '北京市', district: '东城区', service_regions: [] };
const info = { operation: 'add', can_apply: true, business_revision: 2, service_regions: [], subscribe_template_id: 'review-template' };
function start(options = {}) {
  const h = harness(); h.login('electrician');
  const page = h.page('pages/profile/certification/certification.js');
  page.onLoad(options); h.respond(0, base);
  return { h, page };
}
function load(h, page, data = info) {
  page.loadRegionAdditionStatus(); h.respond(h.calls.request.length - 1, data);
}
function prepare(h, page) {
  page.openRegionAddition();
  page.selectTargetRegion({ detail: { value: ['北京市', '北京市', '朝阳区'] } });
  const quote = h.calls.request.at(-1);
  quote.success({ data: { success: true, data: { callout_fees: [30, 60, 90] } } }); quote.complete();
  page.editRegionChangeReason({ detail: { value: '扩大服务范围' } });
}
test('a manual addition requests consent from the submit action and preserves certification after submission', () => {
  const { h, page } = start(); load(h, page); prepare(h, page);
  let consent;
  h.wx.requestSubscribeMessage = options => { consent = options; };
  h.wx.login = options => options.success({ code: 'verified-code' });
  page.submitRegionChange(); h.calls.modal.at(-1).success({ confirm: true });
  assert.equal(consent.tmplIds[0], 'review-template');
  consent.success({ 'review-template': 'accept' });
  const request = h.calls.request.at(-1);
  assert.ok(request.url.endsWith('/region-addition'));
  assert.equal(request.data.district, '朝阳区');
  assert.equal(request.data.notification_login_code, 'verified-code');
  request.success({ data: { code: 200, data: { status: 'pending', operation: 'add' } } }); request.complete();
  h.respond(h.calls.request.length - 1, { ...base, region_change_pending_id: 9,
    pending_region_request: { id: 9, operation: 'add', status: 'pending' } });
  assert.equal(page.data.certificationStatus, 'approved');
  assert.equal(page.data.pendingRegionRequest.operation, 'add');
});
test('out-of-province selection cannot quote or submit an addition', () => {
  const { h, page } = start(); load(h, page); page.openRegionAddition();
  const count = h.calls.request.length;
  page.selectTargetRegion({ detail: { value: ['天津市', '天津市', '和平区'] } });
  assert.equal(h.calls.request.length, count);
  assert.match(page.data.targetRegionError, /当前省份/);
  page.submitRegionChange(); assert.equal(h.calls.modal.length, 0);
});
test('missing qualification or quota disables the addition form and cancellation does not write', () => {
  const { h, page } = start(); load(h, page, { ...info, can_apply: false });
  page.openRegionAddition(); assert.equal(page.data.regionEditorOpen, false);
  load(h, page); prepare(h, page); const count = h.calls.request.length;
  page.closeRegionChange(); assert.equal(page.data.regionEditorOpen, false);
  assert.equal(h.calls.request.length, count);
});
test('a stale addition response cannot replace the fresh certification state', () => {
  const { h, page } = start(); page.loadRegionAdditionStatus(); const old = h.calls.request.at(-1);
  page.loadCertificationInfo(); old.success({ data: { code: 200, data: info } }); old.complete();
  assert.equal(page.data.regionAdditionInfo, null);
});
test('an addition notification resolves the exact owned request using the addition endpoint', () => {
  const { h, page } = start({ step: '2', regionChangeId: '9', regionOperation: 'add' });
  h.respond(h.calls.request.length - 1, { can_apply: false, service_regions: [] });
  assert.ok(h.calls.request.at(-1).url.endsWith('/region-addition?change_id=9'));
  h.respond(h.calls.request.length - 1, { ...info, notification_result: { id: 9, operation: 'add', status: 'approved' } });
  assert.equal(page.data.regionAdditionInfo.notification_result.id, 9);
  assert.equal(page.data.activeStep, 2);
});
test('a cross-province base change warns that all previous areas will be replaced', () => {
  const { h, page } = start(); page.setData({ regionInfo: { can_apply: true, can_self_change: true, business_revision: 2 } });
  page.openRegionChange(); page.selectTargetRegion({ detail: { value: ['天津市', '天津市', '和平区'] } });
  const quote = h.calls.request.at(-1); quote.success({ data: { success: true, data: { callout_fees: [30, 60, 90] } } }); quote.complete();
  page.submitRegionChange(); assert.match(h.calls.modal.at(-1).content, /当前全部接单区域将被替换/);
});
test('a late consent callback cannot submit a newly reopened editor', () => {
  const { h, page } = start(); load(h, page); prepare(h, page);
  let consent;
  h.wx.requestSubscribeMessage = options => { consent = options; };
  h.wx.login = options => options.success({ code: 'late-code' });
  page.submitRegionChange(); h.calls.modal.at(-1).success({ confirm: true });
  page.closeRegionChange(); prepare(h, page); const count = h.calls.request.length;
  consent.success({ 'review-template': 'accept' });
  assert.equal(h.calls.request.length, count);
});
