const test = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./helpers/contentHarness');
function fixture(role = 'enterprise') {
  const h = harness(); h.login(role);
  const transport = h.load('utils/enterpriseSession.js');
  const options = extra => ({ url: h.app.globalData.baseUrl + '/auth/userinfo', header: { Authorization: 'Bearer ' + h.app.globalData.token }, success() {}, ...extra });
  return { h, transport, options };
}

test('M2.6 当前企业黑名单响应清理登录、资料缓存和下单意图，提示准确', () => {
  const {h,transport,options}=fixture(),entry=h.load('utils/orderEntry.js'),id=entry.begin(h.app);h.app.globalData.enterpriseCertification={certStatus:'approved'};let failure;
  transport.request(options({fail:e=>{failure=e;}}));h.respond(0,{reason:'ENTERPRISE_BLACKLISTED'},403);
  assert.equal(failure.enterpriseBlacklisted,true);assert.equal(failure.errMsg,'您已被加入黑名单');assert.equal(h.app.globalData.token,null);assert.equal(h.app.globalData.enterpriseCertification,null);assert.equal(entry.valid(h.app,id),false);
  assert.equal(h.calls.modal[0].content,'您已被加入黑名单');assert.equal(h.calls.relaunch[0].url,'/pages/login/login');
});
test('M2.6 并发黑名单响应只退出一次，旧账号响应不退出新账号', () => {
  const {h,transport,options}=fixture();for(let i=0;i<3;i++)transport.request(options({}));for(let i=0;i<3;i++)h.respond(i,{reason:'ENTERPRISE_BLACKLISTED'},403);
  assert.equal(h.calls.relaunch.length,1);assert.equal(h.calls.modal.length,1);
  const f=fixture();f.transport.request(f.options({}));f.h.app.login({id:2,current_role:'user',phone:'13900000002'},'new-token');f.h.respond(0,{reason:'ENTERPRISE_BLACKLISTED'},403);
  assert.equal(f.h.app.globalData.token,'new-token');assert.equal(f.h.calls.relaunch.length,0);
});
test('M2.6 普通403、打回及非企业身份不触发黑名单退出', () => {
  for(const reason of ['ENTERPRISE_PROFILE_RETURNED','OTHER',undefined]){const {h,transport,options}=fixture();transport.request(options({}));h.respond(0,{reason},403);assert.ok(h.app.globalData.token);assert.equal(h.calls.modal.length,0);}
  for(const role of ['user','electrician']){const {h,transport,options}=fixture(role);transport.request(options({}));h.respond(0,{reason:'ENTERPRISE_BLACKLISTED'},403);assert.ok(h.app.globalData.token);}
});
test('M2.6 API层保留黑名单失败语义，不再显示网络错误或重复toast', async () => {
  const {h}=fixture(),{API}=h.load('utils/api.js');const pending=API.get('/auth/userinfo');h.respond(0,{reason:'ENTERPRISE_BLACKLISTED'},403);
  await assert.rejects(pending,e=>e.message==='您已被加入黑名单'&&e.data.reason==='ENTERPRISE_BLACKLISTED');assert.equal(h.calls.toast.length,0);assert.equal(h.calls.modal.length,1);
});
test('M2.6 上传字符串响应和前台会话校验也识别黑名单', () => {
  const {h,transport,options}=fixture();let upload;h.wx.uploadFile=o=>{upload=o;};transport.uploadFile(options({}));upload.success({statusCode:403,data:JSON.stringify({data:{reason:'ENTERPRISE_BLACKLISTED'}})});assert.equal(h.calls.modal[0].content,'您已被加入黑名单');
  const f=fixture();f.h.app.verifyToken();f.h.respond(0,{reason:'ENTERPRISE_BLACKLISTED'},403);assert.equal(f.h.calls.relaunch.length,1);assert.equal(f.h.app._enterpriseVerification,null);
});
test('M2.6 冻结提示仍使用原文案，移出后重新登录不恢复旧下单意图', () => {
  const {h,transport,options}=fixture();const entry=h.load('utils/orderEntry.js'),old=entry.begin(h.app);transport.request(options({}));h.respond(0,{reason:'ENTERPRISE_BLACKLISTED'},403);
  h.app.login({id:1,current_role:'enterprise',phone:'13900000001'},'relogin-token');let success=false;transport.request(options({success:()=>{success=true;}}));h.respond(1,{});assert.equal(success,true);assert.equal(entry.valid(h.app,old),false);
  transport.request(options({}));h.respond(2,{reason:'ENTERPRISE_FROZEN'},403);assert.equal(h.calls.modal.at(-1).content,'账号已被冻结，请联系客服');
});
test('M2.6 登录失败显示准确黑名单文案且不建立登录态', async () => {
  const h=harness(),page=h.page('pages/login/login.js');h.wx.login=async()=>({});
  page.setData({phone:'13900000001',code:'123456',selectedRole:'enterprise'});page._conversionConsent={phone:'13900000001',role:'enterprise'};
  const pending=page.doLogin();await new Promise(r=>setImmediate(r));assert.equal(h.calls.request.length,1);
  const request=h.calls.request[0];request.success({statusCode:403,data:{code:403,message:'您已被加入黑名单',data:{reason:'ENTERPRISE_BLACKLISTED'}}});await pending;
  assert.equal(h.calls.toast.at(-1).title,'您已被加入黑名单');assert.ok(!h.app.globalData.token);assert.equal(page.data.isLogging,false);assert.equal(h.calls.relaunch.length,0);
});
