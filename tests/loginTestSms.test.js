const test = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./helpers/contentHarness');
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function setup(response) {
  const h = harness(), page = h.page('pages/login/login.js'); page.onLoad({});
  h.app.showLoading = () => {}; h.app.hideLoading = () => {};
  const { AuthAPI } = h.load('utils/api.js'); AuthAPI.sendCode = async () => response;
  page.openLoginForm({ currentTarget: { dataset: { role: 'user' } } });
  page.onPhoneInput({ detail: { value: '13800138000' } });
  return { h, page, api: AuthAPI };
}
test('each role fills six-digit data code, validates login, retains countdown and does not login automatically', async () => {
  for (const role of ['user', 'electrician', 'enterprise']) {
    const { page, api } = setup({ code: 200, data: { testMode: true, code: '783921' } });
    let logins = 0; api.login = async () => { logins++; };
    page.selectRole({ currentTarget: { dataset: { role } } }); await page.sendCode();
    assert.equal(page.data.code, '783921'); assert.equal(page.data.canLogin, true); assert.equal(page.data.countdown, 60); assert.equal(logins, 0);
  }
});
test('outer status, missing mode, wrong types and ordinary SMS never fill a test code', async () => {
  for (const response of [{ code: 200 }, { code: '123456', data: {} }, { code: 200, data: { code: '123456' } },
    { data: { testMode: false, code: '123456' } }, { data: { testMode: true, code: 123456 } }, { data: { testMode: true, code: '200' } }]) {
    const { page } = setup(response); page.setData({ code: '999999', canLogin: true }); await page.sendCode();
    assert.equal(page.data.code, ''); assert.equal(page.data.canLogin, false); assert.equal(page.data.testCode, '');
    page.onCodeInput({ detail: { value: '123456' } }); assert.equal(page.data.canLogin, true);
  }
});
test('phone change, hiding, closing/reopening and unloading invalidate late responses', async () => {
  for (const reason of ['phone', 'hide', 'reopen', 'unload']) {
    const { page, api } = setup(), slow = deferred(); api.sendCode = () => slow.promise;
    const pending = page.sendCode();
    if (reason === 'phone') page.onPhoneInput({ detail: { value: '13900139000' } });
    if (reason === 'hide') page.onHide();
    if (reason === 'unload') page.onUnload();
    if (reason === 'reopen') { page.closeLoginForm(); page.openLoginForm({ currentTarget: { dataset: { role: 'electrician' } } }); }
    slow.resolve({ code: 200, data: { testMode: true, code: '123456' } }); await pending;
    assert.equal(page.data.code, ''); assert.equal(page.data.countdown, 0); assert.equal(page.data.canLogin, false);
  }
});
test('new request supersedes old; old response cannot replace its result', async () => {
  const { page, api } = setup(), slow = deferred(); api.sendCode = () => slow.promise;
  const pending = page.sendCode(); api.sendCode = async () => ({ data: { testMode: true, code: '765432' } }); await page.sendCode();
  slow.resolve({ data: { testMode: true, code: '123456' } }); await pending;
  assert.equal(page.data.code, '765432');
});
test('SMS failure preserves manual flow and does not create countdown', async () => {
  const { page, api, h } = setup(); api.sendCode = async () => { throw new Error('请等待60秒后再试'); };
  await page.sendCode(); assert.equal(page.data.code, ''); assert.equal(page.data.countdown, 0); assert(h.calls.toast.length);
});
