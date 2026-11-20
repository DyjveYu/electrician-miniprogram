const test = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./helpers/contentHarness');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
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

function loadingProbe(h) {
  const events = []; let active = false;
  h.app.showLoading = () => { assert.equal(active, false); active = true; events.push('show'); };
  h.app.hideLoading = () => { assert.equal(active, true, 'hide must own an active loading'); active = false; events.push('hide'); };
  const toast = h.app.showToast;
  h.app.showToast = (...args) => { assert.equal(active, false, 'loading must close before toast replaces it'); events.push('toast'); toast.apply(h.app, args); };
  return { events, active: () => active };
}

test('both SMS success and failure hide their own loading before showing feedback', async () => {
  for (const failure of [false, true]) {
    const { page, api, h } = setup({ code: 200, data: {} }); const probe = loadingProbe(h);
    if (failure) api.sendCode = async () => { throw new Error('request failed'); };
    await page.sendCode(); page.onHide();
    assert.deepEqual(probe.events, ['show', 'hide', 'toast']); assert.equal(page._smsRequest, null);
  }
});

test('superseded SMS completion never hides the loading of the next request', async () => {
  const { page, api, h } = setup(); const probe = loadingProbe(h), first = deferred(), second = deferred();
  api.sendCode = () => first.promise; const old = page.sendCode();
  api.sendCode = () => second.promise; const current = page.sendCode();
  first.resolve({ code: 200, data: {} }); await old;
  assert.equal(probe.active(), true); assert.deepEqual(probe.events, ['show', 'hide', 'show']);
  second.resolve({ code: 200, data: {} }); await current;
  assert.deepEqual(probe.events, ['show', 'hide', 'show', 'hide', 'toast']);
});

test('hiding a pending SMS closes loading once and a late result cannot close it again', async () => {
  const { page, api, h } = setup(); const probe = loadingProbe(h), slow = deferred();
  api.sendCode = () => slow.promise; const pending = page.sendCode();
  page.onHide(); page.onUnload(); slow.resolve({ code: 200, data: {} }); await pending;
  assert.deepEqual(probe.events, ['show', 'hide']);
});

test('invalid phone never leaves a request that can hide a loading that was not shown', async () => {
  let definition, shows = 0, hides = 0, requests = 0;
  const app = { globalData: {}, showLoading: () => shows++, hideLoading: () => hides++ };
  vm.runInNewContext(fs.readFileSync(path.resolve(__dirname, '../pages/login/login.js'), 'utf8'), {
    getApp: () => app, Page: value => { definition = value; }, console: { log() {} },
    require: name => name.endsWith('/visitCapture') ? { register: (register, definition) => register(definition) } : name.endsWith('/util') ? { validatePhone: () => false } : name.endsWith('/api') ? { AuthAPI: { sendCode: async () => requests++ } } : {}
  });
  const page = { ...definition, data: { ...definition.data, phone: 'invalid', canSendCode: true }, setData(value) { Object.assign(this.data, value); } };
  await page.sendCode(); page.onHide();
  assert.equal(shows, 0); assert.equal(hides, 0); assert.equal(requests, 0); assert.equal(page._smsRequest, null);
});

test('HTTP 200 containing another service HTML reports the actual response problem', async () => {
  const h = harness(), api = h.load('utils/api.js').AuthAPI;
  const pending = api.sendCode('13800138000');
  const check = assert.rejects(pending, error => error.code === 'INVALID_API_RESPONSE' && /非 JSON.*地址和端口/.test(error.message));
  h.calls.request[0].success({ statusCode: 200, data: '<!doctype html><html></html>' });
  await check;
});
