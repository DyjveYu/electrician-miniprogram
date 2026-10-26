const test = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./helpers/contentHarness');
const event = role => ({ currentTarget: { dataset: { role } } });
function setup() {
  const h = harness();
  const page = h.page('pages/login/login.js');
  page.onLoad({});
  return { h, page };
}

test('R6: 首页默认不挂载表单，两个入口打开正确角色，每次订单入口默认个人', () => {
  const { page } = setup();
  assert.equal(page.data.showLoginForm, false);
  page.openLoginForm(event('user'));
  assert.equal(page.data.showLoginForm, true);
  assert.equal(page.data.selectedRole, 'user');
  page.selectRole(event('enterprise'));
  assert.equal(page.data.selectedRole, 'enterprise');
  page.closeLoginForm();
  page.openLoginForm(event('user'));
  assert.equal(page.data.selectedRole, 'user');
  page.closeLoginForm();
  page.openLoginForm(event('electrician'));
  assert.equal(page.data.selectedRole, 'electrician');
});

test('R6: 内容来源打开电工弹层、不入栈不滚动，取消清来源并清验证码', () => {
  const { h, page } = setup();
  page.enterElectricianHomeLogin();
  page.onReady();
  assert.equal(page.data.showLoginForm, true);
  assert.equal(page.data.selectedRole, 'electrician');
  assert.equal(h.app.globalData.contentLoginEntry, 'electrician-home');
  page.setData({ code: '123456', canLogin: true });
  page.closeLoginForm();
  assert.equal(page.data.showLoginForm, false);
  assert.equal(page.data.code, '');
  assert.equal(page.data.canLogin, false);
  assert.equal(page._contentEntry, false);
  assert.equal(h.app.globalData.contentLoginEntry, null);
  assert.equal(h.calls.navigate.length + h.calls.scroll.length, 0);
});

test('R6: 提交期间关闭、切换入口、角色和内容来源均不改变正在登录的身份', () => {
  const { page } = setup();
  page.openLoginForm(event('user'));
  page.setData({ isLogging: true });
  page.closeLoginForm();
  page.openLoginForm(event('electrician'));
  page.selectRole(event('enterprise'));
  page.enterElectricianHomeLogin();
  assert.equal(page.data.showLoginForm, true);
  assert.equal(page.data.selectedRole, 'user');
});

test('R6: 协议详情可开关且不关闭登录表单；确认取消后保留表单', () => {
  const { page } = setup();
  page.openLoginForm(event('electrician'));
  page.showPrivacyPolicy();
  page.closeLoginForm();
  assert.equal(page.data.showModal, true);
  assert.equal(page.data.showLoginForm, true);
  page.hideModal();
  page.showUserAgreement();
  assert.equal(page.data.modalTitle, '用户协议');
  page.hideModal();
  page.setData({ canLogin: true });
  page.login();
  page.selectRole(event('user'));
  assert.equal(page.data.selectedRole, 'electrician');
  assert.equal(page.data.showWelcomeModal, true);
  page.onCancel();
  assert.equal(page.data.showWelcomeModal, false);
  assert.equal(page.data.showLoginForm, true);
});

test('R6: 无效入口和角色被忽略，重新打开不重置短信倒计时', () => {
  const { page } = setup();
  page.openLoginForm(event('admin'));
  page.selectRole(event('admin'));
  assert.equal(page.data.showLoginForm, false);
  assert.equal(page.data.selectedRole, 'user');
  page.setData({ countdown: 42, codeButtonText: '42s后重发' });
  page.openLoginForm(event('electrician'));
  page.closeLoginForm();
  page.openLoginForm(event('user'));
  assert.equal(page.data.countdown, 42);
  assert.equal(page.data.codeButtonText, '42s后重发');
});

test('R6: 卸载清理短信倒计时引用', () => {
  const { page } = setup();
  page._countdownTimer = 7;
  page.onUnload();
  assert.equal(page._countdownTimer, null);
});

test('R6: 短信请求发出后卸载，迟到成功不创建新倒计时或写回页面', async () => {
  const { h, page } = setup();
  const { AuthAPI } = h.load('utils/api.js');
  h.app.showLoading = () => {};
  h.app.hideLoading = () => {};
  let finish;
  AuthAPI.sendCode = () => new Promise(resolve => { finish = resolve; });
  page.openLoginForm(event('user'));
  page.setData({ phone: '13800000000', canSendCode: true });
  const sending = page.sendCode();
  page.onUnload();
  finish({ code: 'isolated-sms-code' });
  await sending;
  assert.equal(page.data.countdown, 0);
  assert.equal(page._countdownTimer, null);
  assert.equal(page.data.testCode, '123456');
  assert.equal(h.calls.toast.length, 0);
});

test('R6: 原登录提交仍传递所选个人／企业／电工角色并保存会话', async () => {
  for (const role of ['user', 'enterprise', 'electrician']) {
    const { h, page } = setup();
    const { AuthAPI } = h.load('utils/api.js');
    h.wx.login = async () => ({ code: 'isolated-wx-code' });
    AuthAPI.code2Session = async () => ({ code: 0, data: { openid: 'isolated-openid' } });
    let received;
    AuthAPI.login = async (...args) => {
      received = args;
      return { data: { user: { phone: '13800000000', current_role: role }, token: 'new-test-token' } };
    };
    page.openLoginForm(event(role === 'electrician' ? role : 'user'));
    page.selectRole(event(role));
    page.setData({ phone: '13800000000', code: '123456', canLogin: true });
    page.login();
    assert.equal(page.data.showWelcomeModal, true);
    await page.onAgree();
    assert.deepEqual(received, ['13800000000', '123456', role, 'isolated-openid']);
    assert.equal(h.app.globalData.token, 'new-test-token');
    assert.equal(h.app.globalData.userInfo.current_role, role);
  }
});

test('R6: 登录失败保留弹层且解除提交锁，可取消后重新选择入口', async () => {
  const { h, page } = setup();
  const { AuthAPI } = h.load('utils/api.js');
  h.wx.login = async () => ({});
  AuthAPI.login = async () => { throw new Error('验证码错误'); };
  page.openLoginForm(event('electrician'));
  page.setData({ phone: '13800000000', code: '123456', canLogin: true });
  page.login();
  await page.onAgree();
  assert.equal(page.data.isLogging, false);
  assert.equal(page.data.showLoginForm, true);
  assert.equal(h.calls.toast.at(-1).title, '验证码错误');
  page.closeLoginForm();
  page.openLoginForm(event('user'));
  assert.equal(page.data.selectedRole, 'user');
});
