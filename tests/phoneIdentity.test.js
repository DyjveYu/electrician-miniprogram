const test = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./helpers/contentHarness');
const tick = () => new Promise(resolve => setImmediate(resolve));
function setup() {
  const h=harness();h.login('user','13900000001');h.app.globalData.currentRole='user';
  const page=h.page('pages/login/login.js');page.onLoad({entry:'identity-conversion'});page.setData({phone:'13900000001',code:'123456',canLogin:true});
  h.wx.login=async()=>({code:'wx-code'});const {AuthAPI}=h.load('utils/api.js');AuthAPI.code2Session=async()=>({code:200,data:{openid:'test-openid'}});
  return {h,page,AuthAPI};
}
test('UI-01: 确认前不请求，确认后一次带码及确认参数，成功才更新会话',async()=>{const {h,page,AuthAPI}=setup();const args=[];AuthAPI.login=async(...a)=>{args.push(a);return {data:{user:{id:3,current_role:'electrician'},token:'new-token'}};};page.login();assert.equal(args.length,0);assert.equal(page.data.showWelcomeModal,true);await page.onAgree();assert.deepEqual(args[0],['13900000001','123456','electrician','test-openid',true]);assert.equal(args.length,1);assert.equal(h.app.globalData.token,'new-token');});
test('UI-02: 取消不请求、不更换原会话',async()=>{const {h,page,AuthAPI}=setup();let count=0;AuthAPI.login=async()=>{count++;};page.login();page.onCancel();await page.doLogin();assert.equal(count,0);assert.equal(h.app.globalData.token,'isolated-token');});
test('UI-02: 换手机号使旧确认作废',async()=>{const {page,AuthAPI}=setup();let count=0;AuthAPI.login=async()=>{count++;};page._conversionConsent={phone:page.data.phone,role:'electrician'};page.onPhoneInput({detail:{value:'13900000002'}});await page.doLogin();assert.equal(count,0);assert.equal(page.data.showWelcomeModal,true);});
test('UI-02: 卸载后迟到微信结果不请求登录',async()=>{const {h,page,AuthAPI}=setup();let resolve,count=0;h.wx.login=()=>new Promise(r=>resolve=r);AuthAPI.login=async()=>{count++;};const pending=page.onAgree();await tick();page.onUnload();resolve({code:'wx-code'});await pending;assert.equal(count,0);assert.equal(h.app.globalData.token,'isolated-token');});
test('UI-02: 业务失败保留token和角色并显示提示',async()=>{const {h,page,AuthAPI}=setup();AuthAPI.login=async()=>{const e=new Error('请先处理订单');e.data={reason:'IDENTITY_ORDER_PENDING'};throw e;};await page.onAgree();assert.equal(h.app.globalData.token,'isolated-token');assert.equal(h.app.globalData.currentRole,'user');assert.match(h.calls.toast.at(-1).title,/处理订单/);});
test('V4/V7: 登录API 401保留原会话并保留data.reason，通用业务401仍登出', async () => {
  const h = harness(); h.login('user', '13900000001');
  const { AuthAPI } = h.load('utils/api.js');
  const pending = AuthAPI.login('13900000001', '123456', 'electrician', 'isolated-openid', true);
  const assertion = assert.rejects(pending, error => error.code === 401 && error.data.reason === 'IDENTITY_RETIRED');
  h.calls.request[0].success({ statusCode: 401, data: { message: '身份失效', data: { reason: 'IDENTITY_RETIRED' } } });
  await assertion; assert.equal(h.app.globalData.token, 'isolated-token'); assert.equal(h.calls.relaunch.length, 0);
});
test('V4/V7: 旧切换页跳受控登录入口，不能本地改成电工或切回用户', () => {
  const h = harness(); h.login('user', '13900000001'); h.app.globalData.currentRole = 'user';
  const page = h.page('pages/profile/switch-role/switch-role.js'); page.onLoad();
  page.selectRole({ currentTarget: { dataset: { role: 'electrician' } } });
  assert.equal(h.app.globalData.currentRole, 'user');
  assert.equal(h.calls.navigate[0].url, '/pages/login/login?entry=identity-conversion');
  h.app.globalData.currentRole = 'electrician'; page.loadUserInfo();
  page.selectRole({ currentTarget: { dataset: { role: 'user' } } });
  assert.equal(h.app.globalData.currentRole, 'electrician'); assert.match(h.calls.toast.at(-1).title, /不能/);
});
test('V7: 受控转换入口已登录也不被onShow送回首页', () => {
  const { h, page } = setup(); page.onShow(); for (const callback of h.timers) callback();
  assert.equal(h.calls.relaunch.length, 0); assert.equal(page.data.selectedRole, 'electrician');
});
