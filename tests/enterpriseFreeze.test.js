const test = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./helpers/contentHarness');
function fixture(role = 'enterprise') {
  const h = harness(); h.login(role);
  const transport = h.load('utils/enterpriseSession.js');
  const options = extra => ({ url: h.app.globalData.baseUrl + '/auth/userinfo', header: { Authorization: 'Bearer ' + h.app.globalData.token }, success() {}, ...extra });
  return { h, transport, options };
}
test('M2.4 当前企业收到明确冻结结果，清除会话、缓存和下单意图后进入登录页', () => {
  const { h, transport, options } = fixture();
  const entry = h.load('utils/orderEntry.js'); const id = entry.begin(h.app);
  h.app.globalData.enterpriseCertification = { certStatus: 'approved' };
  let success = false, failure;
  transport.request(options({ success: () => { success = true; }, fail: error => { failure = error; } }));
  h.respond(0, { reason: 'ENTERPRISE_FROZEN' }, 403);
  assert.equal(success, false); assert.equal(failure.enterpriseFrozen, true);
  assert.equal(h.app.globalData.token, null); assert.equal(h.app.globalData.userInfo, null);
  assert.equal(h.app.globalData.enterpriseCertification, null); assert.equal(entry.valid(h.app, id), false);
  assert.deepEqual(h.calls.removed.sort(), ['token', 'userInfo']);
  assert.equal(h.calls.relaunch[0].url, '/pages/login/login');
  assert.equal(h.calls.modal[0].content, '账号已被冻结，请联系客服');
});
test('M2.4 并发冻结响应只退出和提示一次，其余请求以失败结束', () => {
  const { h, transport, options } = fixture(); const failures = [];
  for (let i = 0; i < 3; i++) transport.request(options({ fail: e => failures.push(e) }));
  for (let i = 0; i < 3; i++) h.respond(i, { reason: 'ENTERPRISE_FROZEN' }, 403);
  assert.equal(h.calls.relaunch.length, 1); assert.equal(h.calls.modal.length, 1);
  assert.equal(failures.length, 3); assert.equal(failures[1].sessionChanged, true);
});
test('M2.4 普通403、禁用、网络错误不被当成企业冻结', () => {
  for (const reason of [undefined, 'IDENTITY_RETIRED', 'ACCESS_DENIED']) {
    const { h, transport, options } = fixture(); let result;
    transport.request(options({ success: r => { result = r; } })); h.respond(0, { reason }, 403);
    assert.equal(result.statusCode, 403); assert.equal(h.calls.relaunch.length, 0); assert.equal(h.calls.modal.length, 0);
  }
  const { h, transport, options } = fixture(); let failure;
  transport.request(options({ fail: e => { failure = e; } })); h.calls.request[0].fail({ errMsg: 'offline' });
  assert.equal(failure.errMsg, 'offline'); assert.equal(h.calls.relaunch.length, 0);
});
test('M2.4 个人、电工、公共请求及外部请求不进入企业退出处理', () => {
  for (const role of ['user', 'electrician']) {
    const { h, transport, options } = fixture(role);
    transport.request(options({})); h.respond(0, { reason: 'ENTERPRISE_FROZEN' }, 403);
    assert.ok(h.app.globalData.token); assert.equal(h.calls.modal.length, 0);
  }
  for (const extra of [{ header: {} }, { url: 'https://external.example.test/api/check' }, { header: { Authorization: 'Bearer another-account' } }]) {
    const { h, transport, options } = fixture(); transport.request(options(extra)); h.respond(0, { reason: 'ENTERPRISE_FROZEN' }, 403);
    assert.ok(h.app.globalData.token); assert.equal(h.calls.relaunch.length, 0);
  }
});
test('M2.4 换账号后旧冻结和成功响应都不能退出新账号或执行旧成功回调', () => {
  const { h, transport, options } = fixture(); let succeeded = 0, failed = 0;
  for (let i = 0; i < 2; i++) transport.request(options({ success: () => succeeded++, fail: e => { assert.equal(e.sessionChanged, true); failed++; } }));
  h.app.login({ id: 2, current_role: 'user', phone: '13900000002' }, 'new-account-token');
  h.respond(0, { reason: 'ENTERPRISE_FROZEN' }, 403); h.respond(1, { user: { id: 1 } });
  assert.equal(h.app.globalData.userInfo.id, 2); assert.equal(h.app.globalData.token, 'new-account-token');
  assert.equal(succeeded, 0); assert.equal(failed, 2); assert.equal(h.calls.relaunch.length, 0);
});
test('M2.4 同账号同令牌重新登录后，旧会话响应仍被隔离', () => {
  const { h, transport, options } = fixture(); transport.request(options({}));
  h.app.login({ ...h.app.globalData.userInfo }, h.app.globalData.token);
  h.respond(0, { reason: 'ENTERPRISE_FROZEN' }, 403);
  assert.ok(h.app.globalData.token); assert.equal(h.calls.relaunch.length, 0);
});
test('M2.4 上传的字符串错误响应也能退出，保留原任务和complete回调', () => {
  const { h, transport, options } = fixture(); let upload, failure, completed = 0;
  const task = { abort() {} }; h.wx.uploadFile = o => { upload = o; return task; };
  assert.equal(transport.uploadFile(options({ fail: e => { failure = e; }, complete: () => completed++ })), task);
  const response = { statusCode: 403, data: JSON.stringify({ data: { reason: 'ENTERPRISE_FROZEN' } }) };
  upload.success(response); upload.complete(response);
  assert.equal(failure.enterpriseFrozen, true); assert.equal(completed, 1); assert.equal(h.calls.relaunch.length, 1);
});
test('M2.4 API工具中的冻结失败不会被吞成成功，失败Promise保留reason', async () => {
  const { h } = fixture(); const { API } = h.load('utils/api.js');
  const pending = API.get('/auth/userinfo'); h.respond(0, { reason: 'ENTERPRISE_FROZEN' }, 403);
  await assert.rejects(pending, e => e.code === 403 && e.data.reason === 'ENTERPRISE_FROZEN');
  assert.equal(h.calls.modal.length, 1); assert.equal(h.calls.toast.length, 0);
});
test('M2.4 我的页直接请求收到冻结结果也退出，旧成功响应不能恢复账号', () => {
  const { h } = fixture(); h.wx.stopPullDownRefresh = () => {};
  const page = h.page('pages/profile/profile/profile.js'); page.loadUserInfo();
  h.respond(0, { reason: 'ENTERPRISE_FROZEN' }, 403);
  assert.equal(h.app.globalData.userInfo, null); assert.equal(h.calls.relaunch[0].url, '/pages/login/login');
});
test('M2.4 返回前台校验企业状态，同令牌校验合并，收到冻结后退出', () => {
  const { h } = fixture(); h.app.onShow({}); h.app.verifyToken();
  assert.equal(h.calls.request.length, 1); h.respond(0, { reason: 'ENTERPRISE_FROZEN' }, 403);
  assert.equal(h.calls.relaunch.length, 1); assert.equal(h.app._enterpriseVerification, null);
});
test('M2.4 同令牌新会话可以重新校验，旧校验结束不清除新会话校验标记', () => {
  const { h } = fixture(); h.app.verifyToken();
  h.app.login({ ...h.app.globalData.userInfo }, h.app.globalData.token); h.app.verifyToken();
  assert.equal(h.calls.request.length, 2); const latest = h.app._enterpriseVerification;
  h.respond(0, { reason: 'ENTERPRISE_FROZEN' }, 403);
  assert.equal(h.app._enterpriseVerification, latest); assert.ok(h.app.globalData.token);
  h.respond(1, {}); assert.equal(h.app._enterpriseVerification, null);
});
test('M2.4 解冻后重新登录可正常请求，但不会恢复旧下单意图', () => {
  const { h, transport, options } = fixture(); const entry = h.load('utils/orderEntry.js'); const oldEntry = entry.begin(h.app);
  const user = { ...h.app.globalData.userInfo }; transport.request(options({})); h.respond(0, { reason: 'ENTERPRISE_FROZEN' }, 403);
  h.app.login(user, 'relogin-token'); let success = false;
  transport.request(options({ success: () => { success = true; } })); h.respond(1, { user });
  assert.equal(success, true); assert.equal(entry.valid(h.app, oldEntry), false); assert.equal(h.calls.relaunch.length, 1);
});
