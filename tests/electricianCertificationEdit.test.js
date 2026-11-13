const test = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./helpers/contentHarness');

function start() {
  const h = harness();
  h.login('electrician', '13900000111');
  const page = h.page('pages/profile/certification/certification.js');
  page.onLoad({});
  h.respond(0, {
    user_id: 1, status: 'approved', business_revision: 4, id_card: '110101198901010013',
    career_started_month: '2010-01', hourly_rate: '20.00', daily_rate: '160.00',
    province: '北京市', city: '市辖区', district: '东城区',
    callout_fees_unavailable: true,
    licenses: [{
      license_type: 'low_voltage', label: '低压电工', certificate_number: '真实证号',
      start_date: '2020-01-01', end_date: '2030-01-01', photo_url: '/uploads/fixture.jpg'
    }]
  });
  assert.equal(page.data.editing, true);
  return { h, page };
}
const field = (name, value) => ({ currentTarget: { dataset: { field: name } }, detail: { value } });

test('an approved electrician can switch all tabs while the region stays read-only', () => {
  const { page } = start();
  for (const step of [3, 1, 0, 2]) {
    page.selectStep({ currentTarget: { dataset: { step } } });
    assert.equal(page.data.activeStep, step);
  }
  page.applyRegion(['上海市', '上海市', '黄浦区']);
  assert.equal(page.data.region[0], '北京市');
  assert.equal(page.data.editing, true);
});

test('fees can be saved independently even when the callout fee configuration is unavailable', async () => {
  const { h, page } = start();
  page.editRate(field('hourlyRate', '25.50'));
  const pending = page.saveInformation();
  const request = h.calls.request[1];
  assert.equal(request.method, 'PUT');
  assert.equal(request.data.hourly_rate, 25.5);
  assert.equal(request.data.business_revision, 4);
  assert.equal(request.data.licenses, undefined);
  assert.equal(request.data.province, undefined);
  assert.equal(request.data.daily_rate, undefined);
  request.success({ statusCode: 200, data: { success: true, data: { status: 'approved' } } });
  await pending;
  assert.equal(page.data.editing, false);
  assert.ok(h.calls.request[2].url.endsWith('/certification/status'));
});

test('career month can be saved without submitting the license collection', async () => {
  const { h, page } = start();
  page.editCareerMonth({ detail: { value: '2011-01' } });
  const pending = page.saveInformation();
  assert.equal(h.calls.request[1].data.career_started_month, '2011-01');
  assert.equal(h.calls.request[1].data.licenses, undefined);
  h.calls.request[1].fail();
  await pending;
  assert.equal(page.data.editing, true);
  assert.equal(page.data.careerMonth, '2011-01');
});

test('cancel and a late photo chooser result cannot overwrite the original data', () => {
  const { h, page } = start();
  let chooser;
  h.wx.chooseImage = options => { chooser = options; };
  page.chooseLicensePhoto({ currentTarget: { dataset: { type: 'low_voltage' } } });
  page.editRate(field('hourlyRate', '30'));
  page.cancelEditing();
  chooser.success({ tempFilePaths: ['late.jpg'] });
  assert.equal(page.data.hourlyRate, '20.00');
  assert.equal(page.data.licenses[0].localPhoto, undefined);
  assert.equal(page.data.editing, true);
  assert.equal(h.calls.request.length, 1);
});

test('unchanged saves and invalid values never call the save API', async () => {
  const { h, page } = start();
  await page.saveInformation();
  assert.equal(h.calls.request.length, 1);
  assert.equal(page.data.editing, true);
  assert.equal(h.calls.toast.at(-1).title, '本次未修改资料');
  page.editRate(field('dailyRate', '12.345'));
  await page.saveInformation();
  assert.equal(page.data.editing, true);
  assert.equal(h.calls.request.length, 1);
});

test('conflicts preserve edits until the user confirms a reload', async () => {
  const { h, page } = start();
  page.editRate(field('hourlyRate', '30'));
  const pending = page.saveInformation();
  h.calls.request[1].success({ statusCode: 409, data: { message: '资料已变化' } });
  await pending;
  assert.equal(page.data.editing, true);
  assert.equal(page.data.hourlyRate, '30');
  h.calls.modal.at(-1).success({ confirm: true });
  assert.equal(page.data.editing, true);
  assert.equal(page.data.hourlyRate, '20.00');
  assert.ok(h.calls.request[2].url.endsWith('/certification/status'));
});

test('unsaved changes enable the native exit warning and cancellation clears it', () => {
  const { h, page } = start();
  let warned = false;
  h.wx.enableAlertBeforeUnload = () => { warned = true; };
  h.wx.disableAlertBeforeUnload = () => { warned = false; };
  page.editCareerMonth({ detail: { value: '2011-01' } });
  assert.equal(warned, true);
  page.cancelEditing();
  assert.equal(warned, false);
});

test('repeated entry cannot reset the cancellation snapshot', () => {
  const { page } = start();
  page.editRate(field('hourlyRate', '30'));
  page.startEditing();
  page.cancelEditing();
  assert.equal(page.data.hourlyRate, '20.00');
});

test('a replaced certificate submits only the complete selected certificate collection', async () => {
  const { h, page } = start();
  h.wx.uploadFile = options => options.success({
    statusCode: 200, data: JSON.stringify({ data: { draft: 'uploaded-photo' } })
  });
  page.setData({ licenses: [{ ...page.data.licenses[0], localPhoto: 'new.jpg' }] });
  const pending = page.saveInformation();
  await new Promise(resolve => setImmediate(resolve));
  const request = h.calls.request[1];
  assert.equal(request.data.licenses.length, 1);
  assert.equal(request.data.licenses[0].photo_draft, 'uploaded-photo');
  assert.equal(request.data.career_started_month, undefined);
  assert.equal(request.data.hourly_rate, undefined);
  request.success({ statusCode: 200, data: { success: true, data: { status: 'rejected' } } });
  await pending;
  assert.equal(page.data.editing, false);
});

test('unchanged submissions show the same confirmation and then an informational result', async () => {
  const { h, page } = start();
  page.setData({ activeStep: 3 });
  page.submitInformation();
  const modal = h.calls.modal.at(-1);
  assert.equal(modal.content, '6个月内仅支持一次修改自动审核通过');
  modal.success({ confirm: true });
  assert.equal(h.calls.toast.at(-1).title, '本次未修改资料');
  assert.equal(h.calls.request.length, 1);
  assert.equal(page.data.editing, true);
});

test('continue controls reach the last tab and dismissing submit confirmation retains edits', () => {
  const { h, page } = start();
  for (let step = 1; step <= 3; step++) {
    page.nextEditStep();
    assert.equal(page.data.activeStep, step);
  }
  page.editRate(field('hourlyRate', '30'));
  page.submitInformation();
  h.calls.modal.at(-1).success({ confirm: false });
  assert.equal(page.data.hourlyRate, '30');
  assert.equal(h.calls.request.filter(request => request.method === 'PUT' || request.method === 'POST').length, 0);
});

test('automatic editing still permits independent identity upload and resumes after cancelling it', () => {
  const { h, page } = start();
  page.navigateToIdentity();
  assert.equal(h.calls.navigate.length, 1);
  h.calls.navigate[0].events.acceptDataFromIdentityPage({
    name: page.data.formData.realName, id: page.data.formData.idCard, draftId: 'identity-draft'
  });
  assert.equal(page.data.editing, false);
  page.cancelIdCardUpdate();
  assert.equal(page.data.editing, true);
  assert.equal(page.data.idCardDraft, null);
});
