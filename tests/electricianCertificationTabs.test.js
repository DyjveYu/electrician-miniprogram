const test = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./helpers/contentHarness');

function start(cert = { status: 'none' }) {
  const h = harness();
  h.login('electrician', '13900000111');
  const page = h.page('pages/profile/certification/certification.js');
  page.onLoad({});
  h.respond(0, cert);
  const tab = step => page.selectStep({ currentTarget: { dataset: { step } } });
  return { h, page, tab };
}

test('application requires explicit confirmation, ignores stale quotes and locks edited steps', () => {
  const { h, page, tab } = start();
  assert.equal(page.data.steps.length, 4);
  page.setData({ idCardDraft: { id: '110101198901010013' } });
  tab(1);
  assert.equal(page.data.activeStep, 0);
  page.nextCertificationStep();
  assert.equal(page.data.activeStep, 1);
  page.setData({ businessValid: true });
  tab(2);
  assert.equal(page.data.activeStep, 1);
  page.nextRegionStep();
  page.applyRegion(['香港特别行政区', '香港特别行政区', '中西区']);
  page.nextFeeStep();
  assert.equal(h.calls.request.length, 1);
  page.applyRegion(['北京市', '北京市', '东城区']);
  page.nextFeeStep();
  page.applyRegion(['北京市', '北京市', '延庆区']);
  h.calls.request[1].success({ data: { success: true, data: { callout_fees: [30, 60, 90] } } });
  assert.equal(page.data.calloutFees.length, 0);
  page.nextFeeStep();
  h.calls.request[2].success({ data: { success: true, data: { callout_fees: [30, 60, 90] } } });
  assert.equal(page.data.activeStep, 3);
  tab(1);
  page.editCareerMonth({ detail: { value: '2010-01' } });
  tab(3);
  assert.equal(page.data.activeStep, 1);
  assert.equal(page.data.unlockedStep, 1);
});

test('existing certifications can view all tabs and pending users can restart the application', () => {
  const { page, tab } = start({ status: 'approved', hourly_rate: '18.20', daily_rate: '145.60' });
  tab(3);
  assert.equal(page.data.activeStep, 3);
  assert.equal(page.data.hourlyRate, '18.20');

  const pending = start({ status: 'pending' });
  pending.page.reapplyCertification();
  pending.tab(3);
  assert.equal(pending.page.data.reapply, true);
  assert.equal(pending.page.data.activeStep, 0);
});

test('fee step submits validated rates and shows the automatic result', async () => {
  const { h, page } = start();
  h.wx.uploadFile = options => options.success({ statusCode: 200, data: '{"data":{"draft":"license-draft"}}' });
  page.setData({
    idCardDraft: { id: '110101198901010013', draftId: 'id-draft' },
    careerMonth: '2010-01',
    licenses: [{
      license_type: 'low_voltage', certificate_number: 'TEST', start_date: '2020-01-01',
      end_date: '2030-01-01', localPhoto: 'fake.jpg'
    }]
  });
  page.nextCertificationStep();
  page.checkFormValid();
  page.nextRegionStep();
  page.applyRegion(['北京市', '北京市', '东城区']);
  page.nextFeeStep();
  h.calls.request[1].success({ data: { success: true, data: { callout_fees: [30, 60, 90] } } });
  page.setData({ hourlyRate: '18.20', dailyRate: '145.60', noticeAgreed: true });
  const result = page.submitCertification();
  await Promise.resolve();
  await Promise.resolve();
  const request = h.calls.request[2];
  assert.equal(request.method, 'POST');
  assert.equal(request.data.hourly_rate, 18.2);
  assert.equal(request.data.daily_rate, 145.6);
  assert.equal(request.data.licenses[0].photo_draft, 'license-draft');
  assert.equal(request.data.callout_fees, undefined);
  request.success({ data: { success: true, data: { status: 'approved' } } });
  await result;
  assert.equal(page.data.certificationStatus, 'approved');
  assert.equal(page.data.mode, 'view');
});

test('identity entry retries a failed status load and opens once status is known', () => {
  const h = harness();
  h.login('electrician', '13900000111');
  const page = h.page('pages/profile/certification/certification.js');
  page.onLoad({});
  h.calls.request[0].success({ statusCode: 503, data: { message: '电工认证数据库结构尚未就绪' } });
  h.calls.request[0].complete();
  assert.equal(page.data.certificationLoadError, '电工认证数据库结构尚未就绪');
  page.navigateToIdentity();
  page.navigateToIdentity();
  assert.equal(h.calls.request.length, 2);
  assert.equal(h.calls.navigate.length, 0);
  h.respond(1, { status: 'none' });
  page.navigateToIdentity();
  assert.equal(page.data.certificationLoadError, '');
  assert.equal(h.calls.navigate[0].url, '/pages/profile/certification/identity/identity');
});

test('a failed refresh locks the fee tab while saved certification can still be viewed', () => {
  const { h, page, tab } = start();
  page.applyRegion(['北京市', '北京市', '东城区']);
  page.setData({ activeStep: 2, unlockedStep: 3, calloutFees: [30, 60, 90] });
  page.nextFeeStep();
  tab(3);
  assert.equal(page.data.activeStep, 2);
  h.calls.request[1].success({ statusCode: 503, data: { message: '接单区域的上门费配置暂不可用' } });
  h.calls.request[1].complete();
  assert.equal(page.data.calloutFees.length, 0);
  assert.equal(page.data.unlockedStep, 2);
  assert.equal(h.calls.toast.at(-1).title, '接单区域的上门费配置暂不可用');

  const view = start({ status: 'approved', hourly_rate: '18.20', callout_fees_unavailable: true });
  view.tab(3);
  assert.equal(view.page.data.activeStep, 3);
  assert.equal(view.page.data.certificationStatus, 'approved');
  assert.equal(view.page.data.hourlyRate, '18.20');
  assert.equal(view.page.data.calloutFeesUnavailable, true);
});
