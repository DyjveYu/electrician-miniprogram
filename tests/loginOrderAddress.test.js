const test = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./helpers/contentHarness');
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const raw = (id = 2, district = '测试区') => ({ id, province: '测试省', city: '测试市', district, detail_address: '测试街1号', contact_name: '测试联系人', contact_phone: '13900000111' });
function create(role = 'user') {
  const h = harness(); h.login(role);
  const page = h.page('pages/order/create/create.js');
  page.onLoad(); page.onShow();
  return { h, page };
}
function addressResponses(h, list, address) {
  h.respond(h.calls.request.findIndex(r => r.url.includes('/addresses?page=')), { addresses: list, pagination: { total: list.length, pages: 1 } });
  h.respond(h.calls.request.findIndex(r => r.url.endsWith('/addresses/default')), { address });
}

test('默认意图绑定账号与登录代次，只能消费一次', () => {
  const h = harness(); h.login(); const entry = h.load('utils/orderEntry.js');
  assert.equal(entry.begin(h.app), null);
  h.login('user'); const id = entry.begin(h.app);
  assert.equal(entry.valid(h.app, id), true);
  h.app._orderSessionVersion = 2;
  assert.equal(entry.consume(h.app, id), false);
  const next = entry.begin(h.app); assert.equal(entry.consume(h.app, next), true); assert.equal(entry.consume(h.app, next), false);
});

for (const role of ['user', 'enterprise']) test(`找电工 ${role} 登录直接续接创建，仍保留五参数契约`, async () => {
  const h = harness(); const page = h.page('pages/login/login.js'); page.onLoad({});
  const { AuthAPI } = h.load('utils/api.js');
  h.wx.login = async () => ({});
  let args;
  AuthAPI.login = async (...v) => { args = v; return { data: { user: { id: 10, phone: '13900000111', current_role: role }, token: 'isolated', enterpriseCertification: { certStatus: 'approved' } } }; };
  page.openLoginForm({ currentTarget: { dataset: { role: 'user' } } });
  page.selectRole({ currentTarget: { dataset: { role } } });
  page.setData({ phone: '13900000111', code: '123456' });
  await page.onAgree(); h.timers.forEach(fn => fn());
  assert.equal(args[4], false);
  assert.equal(h.calls.relaunch.at(-1).url, '/pages/order/create/create');
  assert.equal(h.calls.request.filter(r => r.method === 'POST').length, 0);
});

test('取消找电工后再登录电工，旧下单意图不生效', () => {
  const h = harness(); const page = h.page('pages/login/login.js'); page.onLoad({});
  page.openLoginForm({ currentTarget: { dataset: { role: 'user' } } }); page.closeLoginForm();
  page.openLoginForm({ currentTarget: { dataset: { role: 'electrician' } } });
  assert.equal(page._orderRequested, false);
});

for (const hasAddress of [false, true]) test(`R1/R3串联：下单登录进入创建页，${hasAddress ? '已有地址直接带入' : '无地址先添加'}`, async () => {
  const h = harness();
  const login = h.page('pages/login/login.js'); login.onLoad({});
  h.wx.login = async () => ({});
  const { AuthAPI } = h.load('utils/api.js');
  AuthAPI.login = async () => ({ data: { user: { id: 51, phone: '13900000111', current_role: 'user' }, token: 'isolated-r1-r3' } });
  login.openLoginForm({ currentTarget: { dataset: { role: 'user' } } });
  login.setData({ phone: '13900000111', code: '123456' });
  await login.onAgree(); h.timers.slice().forEach(fn => fn());
  assert.equal(h.calls.relaunch.at(-1).url, '/pages/order/create/create');
  const createPage = h.page('pages/order/create/create.js'); createPage.onLoad(); createPage.onShow();
  addressResponses(h, hasAddress ? [raw()] : [], hasAddress ? raw() : null); await flush();
  assert.equal(h.calls.relaunch.some(call => call.url === '/pages/index/index'), false);
  if (hasAddress) {
    assert.equal(createPage.data.selectedAddress.id, 2);
    assert.equal(h.calls.navigate.length, 0);
  } else {
    assert.equal(h.calls.navigate.length, 1);
    assert.equal(h.calls.navigate[0].url, '/pages/address/edit/edit?from=order-create');
    assert.equal(createPage.data.canSubmit, false);
  }
  assert.equal(h.calls.request.some(call => call.method === 'POST' && call.url.endsWith('/orders')), false);
});

test('默认地址带入；用户主动选择不被迟到默认覆盖', async () => {
  const { h, page } = create();
  page._applyAddress(page._mapAddress(raw(3)));
  addressResponses(h, [raw()], raw()); await flush();
  assert.equal(page.data.selectedAddress.id, 3);
  const next = create(); addressResponses(next.h, [raw()], raw()); await flush();
  assert.equal(next.page.data.selectedAddress.id, 2);
  assert.equal(next.page.data.projectAddressDetail, '测试街1号');
});

test('已有地址但无默认只提示选择，不选第一条或恢复历史订单', async () => {
  const { h, page } = create(); addressResponses(h, [raw()], null); await flush();
  assert.equal(page.data.selectedAddress, null); assert.equal(page.data.showAddressSheet, true);
  assert.equal(h.calls.navigate.length, 0);
});

test('空地址只引导添加一次，取消返回不重复弹出；拒绝权限仍可手动添加', async () => {
  const { h, page } = create(); h.wx.getSetting = o => o.success({ authSetting: {} }); h.wx.authorize = o => o.fail();
  addressResponses(h, [], null); await flush();
  assert.equal(h.calls.navigate.length, 1);
  assert.match(h.calls.navigate[0].url, /from=order-create/);
  const start = h.calls.request.length; page.onShow();
  h.respond(start, { addresses: [], pagination: { total: 0, pages: 0 } }); h.respond(start + 1, { address: null }); await flush();
  assert.equal(h.calls.navigate.length, 1);
});

test('地址读取失败不能当作空地址；换账号后迟到响应无效', async () => {
  const { h, page } = create();
  const request = h.calls.request.find(r => r.url.includes('/addresses?page=')); request.fail(); await flush();
  assert.equal(h.calls.navigate.length, 0); assert.match(page.data.addressError, /失败/);
  const next = create(); next.h.app.globalData.userInfo.id = 99;
  addressResponses(next.h, [raw()], raw()); await flush(); assert.equal(next.page.data.selectedAddress, null);
});

test('工程切换不接受越区默认，保存地址通过ID重读后带入', async () => {
  const { h, page } = create('enterprise'); addressResponses(h, [raw()], raw()); await flush();
  page.setData({ enterpriseCertDistrict: '另一区' }); page.switchOrderMode({ currentTarget: { dataset: { mode: 'project' } } });
  assert.equal(page.data.selectedAddress, null); assert.equal(page.data.canSubmit, false);
  page.addAddress(); h.calls.navigate.at(-1).events.addressSaved({ id: 9 });
  h.respond(h.calls.request.length - 1, { address: raw(9, '另一区') }); await flush();
  assert.equal(page.data.selectedAddress.id, 9); assert.equal(page.data.projectRegion[2], '另一区');
});

test('默认地址被删后清除选择，网络结果未知时禁止再次提交', async () => {
  const { h, page } = create(); addressResponses(h, [raw()], raw()); await flush();
  page.onShow(); h.respond(h.calls.request.length - 1, {}, 404); await flush();
  assert.equal(page.data.selectedAddress, null);
  page.setData({ submissionUncertain: true }); assert.equal(page.validateForm(), false);
});

function enterprise() {
  const h = harness(); h.login('enterprise'); const entry = h.load('utils/orderEntry.js'); const id = entry.begin(h.app);
  const page = h.page('pages/enterprise/certification/certification.js'); page.onLoad({ orderEntry: id }); page.onShow();
  return { h, page, entry, id };
}
test('企业pending不跳转；确认approved只续接一次', () => {
  const { h, page } = enterprise(); h.respond(0, { certStatus: 'pending' });
  assert.equal(h.calls.relaunch.length, 0); h.timers[0](); h.respond(1, { certStatus: 'approved' });
  assert.equal(h.calls.relaunch.length, 1); assert.equal(h.calls.relaunch[0].url, '/pages/order/create/create');
  page.loadCertificationInfo(); h.respond(2, { certStatus: 'approved' }); assert.equal(h.calls.relaunch.length, 1);
});
test('企业失败可重查，取消、隐藏和换账号使旧响应失效', () => {
  const { h, page } = enterprise(); h.calls.request[0].fail({ errMsg: 'offline' }); h.calls.request[0].complete();
  assert.match(page.data.continuationMessage, /失败/); page.retryContinuation();
  page.cancelContinuation(); h.respond(1, { certStatus: 'approved' }); assert.equal(h.calls.relaunch.length, 0);
  const hidden = enterprise(); hidden.page.onHide(); hidden.h.respond(0, { certStatus: 'approved' }); assert.equal(hidden.h.calls.relaunch.length, 0);
  const changed = enterprise(); changed.h.app.globalData.userInfo.id = 42; changed.h.respond(0, { certStatus: 'approved' }); assert.equal(changed.h.calls.relaunch.length, 0);
});
test('普通企业资料查看来源即使approved也不续接', () => {
  const h = harness(); h.login('enterprise'); const page = h.page('pages/enterprise/certification/certification.js');
  page.onLoad({}); page.onShow(); h.respond(0, { certStatus: 'approved' }); assert.equal(h.calls.relaunch.length, 0);
});
test('测试支付确认失败不能显示成功，支付锁覆盖后端确认', async () => {
  const h = harness(); h.login('user'); h.app.globalData.paymentMethod = 'test';
  const page = h.page('pages/payment/payment/payment.js'); const { PaymentAPI } = h.load('utils/api.js');
  PaymentAPI.createPayment = async () => ({ code: 200, data: { success: true, payment_no: 'isolated-payment' } });
  let complete; PaymentAPI.confirmTestPayment = () => new Promise(resolve => { complete = resolve; });
  const pending = page.startPayment(); await flush(); assert.equal(page.data.paying, true);
  await page.startPayment(); complete({ code: 500, message: 'confirm failed' }); await pending;
  assert.equal(h.calls.relaunch.length, 0); assert.equal(page.data.paying, false); assert.equal(h.calls.toast.at(-1).title, 'confirm failed');
});

test('测试支付确认成功才显示成功；换账号后旧确认不跳转', async () => {
  for (const changed of [false, true]) {
    const h = harness(); h.login('user'); h.app.globalData.paymentMethod = 'test';
    const page = h.page('pages/payment/payment/payment.js'); page.setData({ orderId: 20 });
    const { PaymentAPI } = h.load('utils/api.js');
    PaymentAPI.createPayment = async () => ({ code: 200, data: { success: true, payment_no: 'isolated' } });
    let done; PaymentAPI.confirmTestPayment = () => new Promise(r => { done = r; });
    const paying = page.startPayment(); await flush(); assert.equal(h.calls.redirect.length, 0);
    if (changed) h.app.globalData.userInfo.id = 50;
    done({ code: 200 }); await paying;
    assert.equal(h.calls.redirect.length, changed ? 0 : 1);
  }
});

test('建单按钮重复操作只发一次；网络未知后保留核对入口', async () => {
  const { h, page } = create(); addressResponses(h, [raw()], raw()); await flush();
  page.setData({ selectedServiceTypeId: 1, selectedServiceType: { id: 1, name: '测试服务' }, description: '测试内容', agreePrepayTerms: true, hasOpenedAgreement: true });
  await page.submitOrder(); await page.submitOrder();
  const posts = h.calls.request.filter(r => r.method === 'POST' && r.url.endsWith('/orders'));
  assert.equal(posts.length, 1); assert.equal(posts[0].data.address_id, 2);
  posts[0].fail({ errMsg: 'offline' });
  assert.equal(page.data.submissionUncertain, true); await page.submitOrder();
  assert.equal(h.calls.request.filter(r => r.method === 'POST' && r.url.endsWith('/orders')).length, 1);
  page.viewOrders(); assert.equal(h.calls.switchTab.at(-1).url, '/pages/order/list/list');
});

test('地址保存成功回传实际ID；取消地图和旧账号保存响应均不回传', () => {
  const h = harness(); h.login('user');
  const page = h.page('pages/address/edit/edit.js'); page.onLoad({ from: 'order-create' });
  const events = []; page.getOpenerEventChannel = () => ({ emit: (...args) => events.push(args) });
  page.setData({ formData: { contactName: '测试联系人', contactPhone: '13900000111', province: '省', city: '市', district: '区', detail: '街道' } });
  page.saveAddress(); h.respond(0, { address: { id: 33 } }); assert.equal(events[0][0], 'addressSaved'); assert.equal(events[0][1].id, 33);
  page.saveAddress(); h.app.globalData.userInfo.id = 99; h.respond(1, { address: { id: 44 } }); assert.equal(events.length, 1);
});

test('重新显示旧账号创建页时清空地址并退出，避免展示残留', async () => {
  const { h, page } = create(); addressResponses(h, [raw()], raw()); await flush();
  h.app.globalData.userInfo.id = 99; page.onShow(); assert.equal(page.data.selectedAddress, null); assert.equal(page.data.canSubmit, false);
  assert.equal(h.calls.relaunch.at(-1).url, '/pages/index/index');
});
