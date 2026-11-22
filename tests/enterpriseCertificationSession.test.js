const test = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./helpers/contentHarness');

const enterprise = { id: 23, current_role: 'enterprise', phone: '13800000123' };
const certificationRoute = 'pages/enterprise/certification/certification';
const approval = { certStatus: 'approved', sessionType: 'authenticated', token: 'test-business-token', user: enterprise };
const savedProfile = {
  certStatus: 'pending', companyName: '测试企业', creditCode: '91320100MA00000001',
  province: '江苏省', city: '南京市', district: '玄武区', address: '测试地址',
  contactName: '测试联系人', licenseImage: '/uploads/certifications/existing.jpg'
};
const flush = () => new Promise(resolve => setImmediate(resolve));

function restrictedResponse() {
  return { sessionType: 'enterprise_certification', certificationToken: 'test-certification-token',
    expiresAt: new Date(Date.now() + 60000).toISOString(), user: enterprise };
}

function openCertification(h, profile = savedProfile) {
  assert.equal(h.app.enterEnterpriseCertification(restrictedResponse(), enterprise.phone, true), true);
  const page = h.page(certificationRoute + '.js');
  page.onLoad();
  page.onShow();
  assert.equal(h.calls.request[0].header.Authorization, 'Bearer test-certification-token');
  h.respond(0, profile);
  return page;
}

function setUpLogin(h, result) {
  const page = h.page('pages/login/login.js');
  h.wx.login = async () => ({ code: 'test-wechat-code' });
  const { AuthAPI } = h.load('utils/api.js');
  AuthAPI.code2Session = async () => ({ code: 200, data: { openid: 'test-openid' } });
  AuthAPI.login = async () => ({ data: result });
  const role = value => ({ currentTarget: { dataset: { role: value } } });
  page.onLoad();
  page.openLoginForm(role('user'));
  page.selectRole(role('enterprise'));
  page.setData({ phone: enterprise.phone, code: '123456', canLogin: true });
  page.login();
  return page;
}

test('M2.7 企业短信登录只建立内存认证会话，直达业务入口会退出回访客', async () => {
  const h = harness(), writes = [];
  h.wx.setStorageSync = (key, value) => writes.push([key, value]);
  const login = setUpLogin(h, restrictedResponse());
  await login.onAgree();
  assert.equal(h.app.globalData.token, null);
  assert.equal(h.app.globalData.userInfo, null);
  assert.equal(h.app.globalData.isLogin, false);
  assert.equal(writes.length, 0);
  assert.deepEqual(h.calls.removed, ['userInfo', 'token']);
  assert.equal(h.calls.navigate.at(-1).url, '/' + certificationRoute);
  assert.equal(h.calls.relaunch.length, 0);
  assert.equal(h.app._enterpriseCertificationSession.fromOrder, true);
  const registration = h.load('utils/visitCapture.js').register(definition => definition, {
    onLoad() { assert.fail('受限会话不得进入业务页面'); },
    onShow() { assert.fail('受限会话不得显示业务页面'); }
  });
  const blocked = { ...registration, route: 'pages/profile/profile/profile' };
  blocked.onLoad();
  blocked.onShow();
  assert.equal(h.app._enterpriseCertificationSession, null);
  assert.equal(h.calls.relaunch.at(-1).url, '/pages/login/login');
  assert.equal(h.calls.request.length, 0);
});

test('M2.7 登录页留在认证前的页面栈，系统返回离开认证即回访客', async () => {
  const h = harness();
  const login = setUpLogin(h, restrictedResponse());
  await login.onAgree();
  assert.deepEqual(h.calls.navigate.map(call => call.url), ['/' + certificationRoute]);
  assert.equal(h.calls.relaunch.length, 0);
  assert.equal(h.pages[0], login);

  const certification = h.page(certificationRoute + '.js');
  certification.onLoad();
  certification.onShow();
  certification.onUnload();
  h.pages.pop();
  login.onShow();
  assert.equal(h.app.globalData.isLogin, false);
  assert.equal(h.app._enterpriseCertificationSession, null);
  assert.equal(h.calls.relaunch.at(-1).url, '/pages/login/login');
});

test('M2.7 旧后端返回普通企业未认证凭据时拒绝建立会话，短信接口仍声明客户端能力', async () => {
  const h = harness();
  const pending = h.load('utils/api.js').AuthAPI.login(enterprise.phone, '123456', 'enterprise');
  assert.equal(h.calls.request[0].header['X-Miniapp-Certification-Session'], '1');
  h.respond(0, { user: enterprise, token: 'old-ordinary-token' });
  await pending;
  const login = setUpLogin(h, { user: enterprise, token: 'old-ordinary-token', enterpriseCertification: { certStatus: 'pending' } });
  await login.onAgree();
  assert.equal(h.app.globalData.token, null);
  assert.equal(h.calls.relaunch.length, 0);
  assert.match(h.calls.toast.at(-1).title, /暂不支持企业认证/);
});

test('M2.7 冷启动旧企业缓存经服务端核验前不激活页面，批准及打回可恢复原入口', async () => {
  for (const certStatus of ['approved', 'returned']) {
    const h = harness(), called = [];
    h.wx.getStorageSync = key => ({ token: 'cached-token', userInfo: enterprise })[key];
    h.app.checkLoginStatus();
    const verification = h.app._enterpriseCacheCheck;
    const registration = h.load('utils/visitCapture.js').register(definition => definition, {
      onLoad(query) { called.push(query.origin); },
      onShow() { called.push('shown'); },
      onReady() { called.push('ready'); }
    });
    const page = { ...registration, route: 'pages/index/index' };
    page.onLoad({ origin: 'shared-link' });
    page.onShow();
    page.onReady();
    assert.equal(h.app.globalData.token, null);
    assert.deepEqual(called, []);
    const home = h.page('pages/index/index.js');
    assert.equal(home.checkLogin(), false);
    assert.equal(h.app.globalData.token, null);
    assert.equal(h.calls.request.length, 1);
    assert.equal(h.calls.request[0].header['X-Miniapp-Certification-Session'], '1');
    h.respond(0, { valid: true, user: enterprise });
    await flush();
    assert.equal(h.calls.request[1].url.endsWith('/miniprogram/enterprise/certification'), true);
    assert.equal(h.app.globalData.token, null);
    h.respond(1, { certStatus });
    assert.equal(await verification, true);
    assert.equal(h.app.globalData.token, 'cached-token');
    assert.deepEqual(called, ['shared-link', 'shown', 'ready']);
    assert.equal(h.calls.relaunch.length, 0);
  }
});

test('M2.7 冷启动旧企业缓存可转受限；旧后端 pending 或核验断网都回访客', async () => {
  for (const result of ['restricted', 'old pending', 'offline']) {
    const h = harness();
    h.wx.getStorageSync = key => ({ token: 'cached-token', userInfo: enterprise })[key];
    h.app.checkLoginStatus();
    const verification = h.app._enterpriseCacheCheck;
    if (result === 'restricted') h.respond(0, restrictedResponse());
    else if (result === 'offline') h.calls.request[0].fail();
    else {
      h.respond(0, { valid: true, user: enterprise });
      await flush();
      h.respond(1, { certStatus: 'pending' });
    }
    assert.equal(await verification, false);
    assert.equal(h.app.globalData.token, null);
    assert.deepEqual(h.calls.removed, ['userInfo', 'token']);
    assert.equal(h.calls.relaunch.at(-1).url, result === 'restricted' ? '/' + certificationRoute : '/pages/login/login');
  }
});

test('M2.7 pending 资料可编辑，替换证照后丢失回包可原样重试，批准只打开一次创建页', async () => {
  const h = harness(), uploads = [];
  let choose;
  h.wx.chooseImage = options => { choose = options; };
  h.wx.getFileSystemManager = () => ({ getFileInfo: options => options.success({ size: 20 }) });
  h.wx.uploadFile = options => uploads.push(options);
  const page = openCertification(h);
  assert.equal(page.data.mode, 'apply');
  assert.equal(page.data.certStatus, 'pending');
  assert.equal(page.data.formData.companyName, savedProfile.companyName);
  assert.equal(page.data.submitDisabled, false);
  page.chooseLicenseImage();
  page.onHide();
  choose.success({ tempFilePaths: ['wxfile://proof.jpg'] });
  page.onShow();
  assert.equal(h.calls.request.length, 1);
  assert.equal(page.data.licenseImagePath, 'wxfile://proof.jpg');

  const first = page.submitCertification();
  assert.equal(uploads[0].header.Authorization, 'Bearer test-certification-token');
  uploads[0].success({ statusCode: 200, data: JSON.stringify({ code: 200, data: {
    url: 'https://isolated.invalid/uploads/certifications/new.jpg', certificationUploadToken: 'test-proof'
  } }) });
  await flush();
  h.calls.request[1].fail({ errMsg: 'mock lost reply' });
  await first;
  assert.equal(h.app.globalData.isLogin, false);

  const second = page.submitCertification();
  await flush();
  assert.equal(uploads.length, 1);
  assert.equal(h.calls.request[2].header.Authorization, 'Bearer test-certification-token');
  assert.deepEqual(h.calls.request[2].data, h.calls.request[1].data);
  assert.equal(h.calls.request[2].data.certificationUploadToken, 'test-proof');
  assert.equal(h.calls.request[2].data.licenseImage, '/uploads/certifications/new.jpg');
  h.respond(2, approval);
  await second;
  page.onUnload();
  assert.equal(h.app.globalData.token, 'test-business-token');
  assert.equal(h.app.globalData.enterpriseCertification.certStatus, 'approved');
  assert.equal(h.app.globalData.enterpriseCertification.token, undefined);
  assert.equal(h.calls.relaunch.filter(call => call.url.endsWith('?entry=enterprise-certification')).length, 1);
  assert.ok(h.calls.request.every(call => !call.url.endsWith('/visits/events')));
});

test('M2.7 取消或卸载时可离开正在提交的页面，迟到批准不会恢复旧登录', async () => {
  for (const method of ['cancelCertification', 'onUnload']) {
    const h = harness(), masks = [];
    h.wx.request = options => { h.calls.request.push(options); return options; };
    h.wx.showLoading = options => masks.push(options.mask);
    const page = openCertification(h);
    const submission = page.submitCertification();
    await flush();
    assert.deepEqual(masks.filter(value => value !== undefined), [false, false]);
    const request = h.calls.request[1];
    let aborted = false;
    // 隔离传输替身允许已取消的请求仍递送旧响应。
    request.abort = () => { aborted = true; };
    page[method]();
    assert.equal(aborted, true);
    assert.equal(h.app.globalData.isLogin, false);
    assert.equal(h.app._enterpriseCertificationSession, null);
    assert.equal(h.calls.relaunch.at(-1).url, '/pages/login/login');
    h.respond(1, approval);
    await submission;
    assert.equal(h.app.globalData.token, null);
    assert.equal(h.calls.relaunch.length, 2);
  }
});

test('M2.7 失败响应和异账号批准无法登录，后台收到本账号批准后回前台只续接一次', async () => {
  const h = harness(), page = openCertification(h);
  const failed = page.submitCertification();
  await flush();
  h.calls.request[1].success({ statusCode: 403, data: { code: 200, data: approval } });
  await failed;
  assert.equal(h.app.globalData.isLogin, false);
  const other = page.submitCertification();
  await flush();
  h.respond(2, { ...approval, user: { ...enterprise, id: 999 } });
  await other;
  assert.equal(h.app.globalData.isLogin, false);

  const success = page.submitCertification();
  await flush();
  page.onHide();
  h.respond(3, approval);
  await success;
  assert.equal(h.app.globalData.token, null);
  page.onShow();
  page.onUnload();
  assert.equal(h.app.globalData.token, 'test-business-token');
  assert.equal(h.calls.relaunch.filter(call => call.url.endsWith('?entry=enterprise-certification')).length, 1);
});

test('M2.7 受限时丢弃待发送访问，退出后新的登录页正常计作访客', () => {
  const h = harness(), capture = h.load('utils/visitCapture.js');
  const start = { ...capture.register(definition => definition, {}), route: 'pages/login/login' };
  start.onShow();
  const page = openCertification(h, null);
  while (h.timers.length) h.timers.shift()();
  assert.equal(h.calls.request.length, 1);
  page.cancelCertification();
  const guest = { ...capture.register(definition => definition, {}), route: 'pages/login/login' };
  guest.onShow();
  while (h.timers.length) h.timers.shift()();
  assert.equal(h.calls.request[1].url.endsWith('/visits/events'), true);
  assert.equal(h.calls.request[1].header.Authorization, undefined);
});

test('M2.7 认证查询失败不可提交，过期回访客，认证后创建页返回已登录首页', () => {
  const h = harness();
  h.wx.hideHomeButton = () => {};
  h.app.enterEnterpriseCertification(restrictedResponse(), enterprise.phone, true);
  const page = h.page(certificationRoute + '.js');
  page.onLoad();
  page.onShow();
  h.calls.request[0].fail({ errMsg: 'mock offline' });
  h.calls.request[0].complete?.();
  assert.equal(page.data.certificationReady, false);
  assert.match(page.data.continuationMessage, /取消后重新登录/);
  page.onHide();
  h.app._enterpriseCertificationSession.expiresAt = 0;
  page.onShow();
  assert.equal(h.calls.relaunch.at(-1).url, '/pages/login/login');

  h.app.login(enterprise, 'new-token');
  h.app.globalData.enterpriseCertification = { certStatus: 'approved' };
  const create = h.page('pages/order/create/create.js');
  create.setCreateNavigation({ entry: 'enterprise-certification' }, h.app);
  assert.equal(create.data.fromEnterpriseCertification, true);
  assert.equal(create.data.showCreateBack, true);
  create.goBack();
  assert.equal(h.calls.switchTab.at(-1).url, '/pages/index/index');
  assert.equal(h.app.globalData.token, 'new-token');
});
