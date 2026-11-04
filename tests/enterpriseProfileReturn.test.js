const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { harness } = require('./helpers/contentHarness');
const flush = () => new Promise(resolve => setImmediate(resolve));
const profile = { certStatus: 'returned', returnReason: '请核实营业执照', companyName: 'M25企业', creditCode: '123456789012345678',
  province: '省', city: '市', district: '区', address: '街道1号', contactName: '联系人', contactPhone: '13900000001', licenseImage: '/uploads/certifications/m25.png' };
function fixture(continuing = false) {
  const h = harness(); h.login('enterprise'); const entry = h.load('utils/orderEntry.js');
  const page = h.page('pages/enterprise/certification/certification.js');
  page.onLoad(continuing ? { orderEntry: entry.begin(h.app) } : {}); page.onShow(); h.respond(0, profile);
  return { h, page };
}
test('M2.5 已打回加载完整资料及原因，允许原样重提并清除原因', async () => {
  const { h, page } = fixture(); assert.equal(page.data.returnReason, profile.returnReason); assert.equal(page.data.submitDisabled, false);
  const saved = page.submitCertification(); await flush(); const i = h.calls.request.findIndex(r => r.method === 'POST');
  assert.ok(i >= 0); assert.equal(h.calls.request[i].data.companyName, profile.companyName);
  h.respond(i, { ...profile, certStatus: 'approved', returnReason: null }); await saved;
  assert.equal(page.data.certStatus, 'approved'); assert.equal(page.data.returnReason, ''); assert.equal(h.calls.relaunch.length, 0);
  h.timers.forEach(fn => fn()); assert.equal(h.calls.switchTab.at(-1).url, '/pages/profile/profile/profile');
});
test('M2.5 从找电工进入打回资料，重提成功仅进入创建页一次', async () => {
  const { h, page } = fixture(true); const saved = page.submitCertification(); await flush(); await page.submitCertification();
  const indices = h.calls.request.map((r, i) => r.method === 'POST' ? i : -1).filter(i => i >= 0); assert.equal(indices.length, 1);
  h.respond(indices[0], { ...profile, certStatus: 'approved', returnReason: null }); await saved;
  assert.equal(h.calls.relaunch.length, 1); assert.equal(h.calls.relaunch[0].url, '/pages/order/create/create');
});
test('M2.5 提交失败仍保留原因和资料，切换账号后迟到响应不跳转', async () => {
  for (const switchAccount of [false, true]) {
    const { h, page } = fixture(true); const saved = page.submitCertification(); await flush(); const i = h.calls.request.findIndex(r => r.method === 'POST');
    if (switchAccount) h.app.globalData.userInfo.id = 8;
    h.respond(i, { certStatus: switchAccount ? 'approved' : 'returned', returnReason: profile.returnReason }); await saved;
    assert.equal(h.calls.relaunch.length, 0); assert.equal(page.data.returnReason, profile.returnReason);
  }
});
test('M2.5 提交前发起的旧资料查询不能覆盖重提结果', async () => {
  const { h, page } = fixture(); page.loadCertificationInfo(); const query = h.calls.request.length - 1;
  const saved = page.submitCertification(); await flush(); const i = h.calls.request.findIndex(r => r.method === 'POST');
  h.respond(i, { ...profile, certStatus: 'approved', returnReason: null }); await saved; h.respond(query, profile);
  assert.equal(page.data.certStatus, 'approved'); assert.equal(page.data.returnReason, '');
});
test('M2.5 新建订单收到打回提示，保留会话并可引导重提后继续下单', () => {
  const h = harness(); h.login('enterprise'); const page = h.page('pages/order/create/create.js');
  page._account = h.load('utils/orderEntry.js').key(h.app); page._unloaded = false;
  assert.equal(page.handleReturnedProfile({ data: { reason: 'OTHER' } }), false);
  const denied = { data: { reason: 'ENTERPRISE_PROFILE_RETURNED', returnReason: profile.returnReason } };
  assert.equal(page.handleReturnedProfile(denied), true); page.handleReturnedProfile(denied); assert.equal(h.calls.modal.length, 1);
  assert.equal(h.app.globalData.isLogin, true); assert.equal(h.app.globalData.token, 'isolated-token');
  h.calls.modal[0].success({ confirm: true }); assert.match(h.calls.relaunch[0].url, /certification\?orderEntry=/);
  assert.equal(h.load('utils/orderEntry.js').valid(h.app), true);
});
test('M2.5 取消引导不跳转，旧账号提示响应不能恢复旧下单意图', () => {
  for (const switched of [false, true]) {
    const h = harness(); h.login('enterprise'); const page = h.page('pages/order/create/create.js'); page._account = h.load('utils/orderEntry.js').key(h.app);
    page.handleReturnedProfile({ data: { reason: 'ENTERPRISE_PROFILE_RETURNED' } });
    if (switched) h.app.globalData.userInfo.id = 99;
    h.calls.modal[0].success({ confirm: switched }); assert.equal(h.calls.relaunch.length, 0);
  }
});
test('M2.5 模板开放打回资料编辑和重提，手机号仍只读', () => {
  const wxml = fs.readFileSync(path.join(__dirname, '../pages/enterprise/certification/certification.wxml'), 'utf8');
  assert.match(wxml, /打回原因：\{\{returnReason\}\}/); assert.match(wxml, /重新提交认证/);
  const inputs = wxml.match(/<input[^>]+>/g); const phone = inputs.find(x => x.includes('formData.contactPhone')); assert.match(phone, /disabled\s*\/>/);
  for (const input of inputs.filter(x => !x.includes('contactPhone'))) assert.match(input, /certStatus !== 'returned'/);
});
test('M2.5 消息列表和详情请求传递个人消息来源，避免同ID公告串读', async () => {
  const h=harness();h.login('enterprise');const page=h.page('pages/message/detail/detail.js');
  page.onLoad({id:'17',source:'personal'});
  assert.match(h.calls.request[0].url,/\/messages\/17\?source=personal$/);
  h.respond(0,{id:17,title:'打回',content:'原因',type:'system',created_at:'2026-01-01'});await flush();
  assert.match(h.calls.request[1].url,/\/messages\/17\/read\?source=personal$/);h.respond(1,{});await flush();
  assert.equal(page.data.message.title,'打回');
});
test('M2.5 离开创建页后迟到的认证查询不弹窗或触发跳转', () => {
  const h=harness();h.login('enterprise');const page=h.page('pages/order/create/create.js');page._account=h.load('utils/orderEntry.js').key(h.app);
  page.loadEnterpriseCert();page.onHide();h.respond(0,profile);
  assert.equal(h.calls.modal.length,0);assert.equal(h.calls.relaunch.length,0);
  assert.equal(page.handleReturnedProfile({data:{reason:'ENTERPRISE_PROFILE_RETURNED'}}),true);assert.equal(h.calls.modal.length,0);
});
