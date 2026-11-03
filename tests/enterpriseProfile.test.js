const test = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./helpers/contentHarness');
const flush = () => new Promise(resolve => setImmediate(resolve));
function fixture(continuing = false) {
  const h = harness(); h.login('enterprise');
  const entry = h.load('utils/orderEntry.js');
  const options = continuing ? { orderEntry: entry.begin(h.app) } : {};
  const page = h.page('pages/enterprise/certification/certification.js'); page.onLoad(options); page.onShow();
  h.respond(0, null);
  page.setData({ region: ['省', '市', '区'], licenseImagePath: '/uploads/certifications/cert_test.png', submitDisabled: false,
    formData: { companyName: '企业', creditCode: '123456789012345678', addressDetail: '街1号', contactName: '联系人', contactPhone: '13900000001' } });
  return { h, page };
}
async function submit(f) {
  const pending = f.page.submitCertification(); await flush();
  const index = f.h.calls.request.findIndex(r => r.method === 'POST');
  assert.ok(index >= 0); return { pending, index };
}
test('M2.3：从找电工进入认证，服务端通过后直接进入创建页一次', async () => {
  const f = fixture(true), { pending, index } = await submit(f);
  f.h.respond(index, { certStatus: 'approved', companyName: '企业', licenseImage: '/uploads/certifications/cert_test.png' }); await pending;
  assert.equal(f.page.data.certStatus, 'approved'); assert.equal(f.h.calls.relaunch.length, 1);
  assert.equal(f.h.calls.relaunch[0].url, '/pages/order/create/create');
  assert.equal(f.h.app.globalData.enterpriseCertification.certStatus, 'approved');
  assert.equal(f.h.calls.request.filter(r => r.method === 'POST').length, 1);
});
test('M2.3：从我的保存资料，不跳创建订单页', async () => {
  const f = fixture(), { pending, index } = await submit(f);
  f.h.respond(index, { certStatus: 'approved' }); await pending;
  assert.equal(f.h.calls.relaunch.length, 0); f.h.timers.forEach(timer => timer());
  assert.equal(f.h.calls.switchTab.at(-1).url, '/pages/profile/profile/profile');
});
test('M2.3：服务端未确认通过或返回失败，不伪造成功', async () => {
  for (const status of ['pending', null]) {
    const f = fixture(true), { pending, index } = await submit(f);
    f.h.respond(index, { certStatus: status }); await pending;
    assert.equal(f.h.calls.relaunch.length, 0); assert.notEqual(f.page.data.certStatus, 'approved');
    assert.equal(f.page.data.submitting, false); assert.ok(f.h.calls.modal.length > 0);
  }
});
test('M2.3：提交中重复点击只发一次，旧账号成功响应不跳转', async () => {
  const f = fixture(true), { pending, index } = await submit(f);
  await f.page.submitCertification(); assert.equal(f.h.calls.request.filter(r => r.method === 'POST').length, 1);
  f.h.app.globalData.userInfo.id = 77; f.h.respond(index, { certStatus: 'approved' }); await pending;
  assert.equal(f.h.calls.relaunch.length, 0);
});
test('M2.3：离开后迟到响应无效，pending查询不创建审核轮询', async () => {
  const f = fixture(true), { pending, index } = await submit(f);
  f.page.onHide(); f.h.respond(index, { certStatus: 'approved' }); await pending;
  assert.equal(f.h.calls.relaunch.length, 0);
  const g = fixture(true); const before = g.h.timers.length;
  g.page.loadCertificationInfo(); g.h.respond(g.h.calls.request.length - 1, { certStatus: 'pending' });
  assert.equal(g.h.timers.length, before);
});
test('M2.3：地址仅改文案，联系人与手机号原称呼、保存修改入口可见', () => {
  const fs = require('node:fs'), path = require('node:path');
  const wxml = fs.readFileSync(path.join(__dirname, '../pages/enterprise/certification/certification.wxml'), 'utf8');
  assert.ok(wxml.includes('实际经营地址（省市区）')); assert.ok(wxml.includes('实际经营地址（详细地址）'));
  assert.ok(wxml.includes('联系人')); assert.ok(!wxml.includes('注册人姓名')); assert.ok(wxml.includes('保存修改'));
});

test('M2.3验收问题：我的三个入口绑定现有方法，打开已注册的正确页面', () => {
  const fs = require('node:fs'), path = require('node:path');
  const root = path.join(__dirname, '..');
  const wxml = fs.readFileSync(path.join(root, 'pages/profile/profile/profile.wxml'), 'utf8');
  const routes = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).pages;
  const h = harness(); h.login('enterprise');
  const page = h.page('pages/profile/profile/profile.js');
  page.setData({ currentRole: 'enterprise', enterpriseCertStatus: 'approved' });
  const entries = [
    ['handleEnterpriseCertification', '/pages/enterprise/certification/certification?mode=view'],
    ['navigateToCreateOrder', '/pages/order/create/create'],
    ['navigateToAbout', '/pages/about/about/about']
  ];
  for (const [handler, url] of entries) {
    assert.ok(wxml.includes(`bindtap="${handler}"`));
    page[handler]();
    assert.equal(h.calls.navigate.at(-1).url, url);
    assert.ok(routes.includes(url.split('?')[0].slice(1)));
  }
  assert.equal(h.calls.relaunch.length, 0);
});

test('M2.3验收问题：我的入口跳转失败时显示提示，仍可再次点击', () => {
  const h = harness(); h.login('enterprise');
  const page = h.page('pages/profile/profile/profile.js');
  page.setData({ enterpriseCertStatus: 'approved' });
  for (const handler of ['handleEnterpriseCertification', 'navigateToCreateOrder', 'navigateToAbout']) {
    page[handler]();
    h.calls.navigate.at(-1).fail({ errMsg: 'navigateTo:fail test navigation error' });
    assert.equal(h.calls.toast.at(-1).title, '页面打开失败，请重试');
    const count = h.calls.navigate.length;
    page[handler]();
    assert.equal(h.calls.navigate.length, count + 1);
  }
});

test('M2.3验收问题：营业执照回显与预览使用服务器地址，保存保留相对路径', () => {
  const f = fixture();
  f.h.app.globalData.imageBaseUrl = 'https://images.example.test/';
  f.page.loadCertificationInfo();
  f.h.respond(f.h.calls.request.length - 1, { certStatus: 'approved', licenseImage: '/uploads/certifications/license.jpg' });
  assert.equal(f.page.data.licenseImagePath, '/uploads/certifications/license.jpg');
  assert.equal(f.page.data.licenseImageUrl, 'https://images.example.test/uploads/certifications/license.jpg');
  let preview;
  f.h.wx.previewImage = options => { preview = options; };
  f.page.previewLicenseImage();
  assert.equal(preview.urls[0], f.page.data.licenseImageUrl);
  for (const url of ['wxfile://tmp/test.jpg', 'http://tmp/test.jpg', 'https://images.example.test/test.jpg', '']) {
    assert.equal(f.page.resolveLicenseImageUrl(url), url);
  }
  const fs = require('node:fs'), path = require('node:path');
  const wxml = fs.readFileSync(path.join(__dirname, '../pages/enterprise/certification/certification.wxml'), 'utf8');
  assert.ok(wxml.includes('src="{{licenseImageUrl}}"'));
});
