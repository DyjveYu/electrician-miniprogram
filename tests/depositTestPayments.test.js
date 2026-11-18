const test=require('node:test'),assert=require('node:assert/strict');
const {harness}=require('./helpers/contentHarness');
function ready(enabled=true){
  const h=harness();h.login('electrician','13900000007');const p=h.page('pages/profile/deposit/deposit.js');
  let logins=0,payments=0;h.wx.login=()=>{logins++;};h.wx.requestPayment=()=>{payments++;};
  p.onLoad();h.respond(0,{status:null,amount:200,testPaymentEnabled:enabled,isTestPayment:false});
  return {h,p,logins:()=>logins,payments:()=>payments};
}
test('server-enabled simulated deposit needs explicit confirmation and never invokes wx login or payment',()=>{
  const{h,p,logins,payments}=ready();p.handlePay();assert.match(h.calls.modal[0].content,/不发生真实扣款/);assert.equal(h.calls.request.length,1);
  h.calls.modal[0].success({confirm:true});assert.equal(h.calls.request[1].data.payment_method,'test');assert.equal(p.data.paying,true);
  p.createDepositOrder();assert.equal(h.calls.request.length,2);
  h.respond(1,{status:'paid',isTestPayment:true});assert.equal(h.calls.toast.at(-1).title,'押金已模拟缴纳');
  h.respond(2,{status:'paid',testPaymentEnabled:true,isTestPayment:true,transactionId:'TEST_DEPOSIT_isolated'});
  assert.equal(p.data.isTestPayment,true);assert.equal(p.data.depositInfo.status,'paid');assert.equal(p.data.paying,false);
  assert.equal(logins(),0);assert.equal(payments(),0);
});
test('cancelling simulated deposit confirmation never creates any payment',()=>{
  const{h,p}=ready();p.handlePay();h.calls.modal[0].success({confirm:false});assert.equal(h.calls.request.length,1);
});
test('HTTP200 business failure is not simulated payment success',()=>{
  const{h,p}=ready();p.createDepositOrder();h.calls.request[1].success({statusCode:200,data:{code:200,success:false,message:'测试开关已关闭',data:{status:'paid'}}});h.calls.request[1].complete();
  assert.equal(h.calls.toast.at(-1).icon,'none');assert.equal(h.calls.request.length,2);assert.equal(p.data.paying,false);assert.equal(p.data.depositInfo.status,null);
});
test('network uncertainty does not show paid or automatically repeat a simulation',()=>{
  const{h,p}=ready();p.createDepositOrder();h.calls.request[1].fail({errMsg:'request:fail timeout'});h.calls.request[1].complete();
  assert.match(h.calls.toast.at(-1).title,/未确认/);assert.equal(h.calls.request.length,2);assert.equal(p.data.depositInfo.status,null);
});
test('unloaded or failed server capability cannot trigger payment',()=>{
  const h=harness();h.login();const p=h.page('pages/profile/deposit/deposit.js');p.onLoad();p.handlePay();p.createDepositOrder();assert.equal(h.calls.modal.length,0);assert.equal(h.calls.request.length,1);
  h.calls.request[0].success({statusCode:200,data:{code:200,success:false,data:{testPaymentEnabled:true}}});
  assert.equal(p.data.statusLoaded,false);p.createDepositOrder();assert.equal(h.calls.request.length,1);
});
test('switching account after confirmation request cannot trigger or report an old simulated payment',()=>{
  const first=ready();first.p.handlePay();first.h.app.globalData.token='new-account';first.h.calls.modal[0].success({confirm:true});assert.equal(first.h.calls.request.length,1);
  const second=ready();second.p.createDepositOrder();second.h.app.globalData.token='new-account';second.h.respond(1,{status:'paid',isTestPayment:true});
  assert.equal(second.h.calls.toast.length,0);assert.equal(second.h.calls.request.length,2);
});
test('a late status response from the old identity cannot enable test mode',()=>{
  const h=harness();h.login();const p=h.page('pages/profile/deposit/deposit.js');p.onLoad();h.app.globalData.token='changed';h.respond(0,{testPaymentEnabled:true,status:'paid',isTestPayment:true});assert.equal(p.data.statusLoaded,false);
});
test('old server without explicit capability cannot silently send a test user into real payment',()=>{
  const h=harness();h.login();const p=h.page('pages/profile/deposit/deposit.js');p.onLoad();h.respond(0,{status:null,amount:200});
  assert.equal(p.data.statusLoaded,false);assert.match(p.data.statusError,/重启后端/);p.handlePay();assert.equal(h.calls.modal.length,0);
  p.loadDepositStatus();h.respond(1,{status:null,amount:200,testPaymentEnabled:true});assert.equal(p.data.statusLoaded,true);assert.equal(p.data.statusError,'');
});
test('existing real paid record is not relabeled as simulated by a test-enabled server',()=>{
  const{h,p}=ready();p.createDepositOrder();h.respond(1,{status:'paid',isTestPayment:false});assert.equal(h.calls.toast.at(-1).title,'押金已缴纳');
});
test('test refund dialog does not promise a real WeChat refund',()=>{
  const{h,p}=ready();p.setData({isTestPayment:true});p.handleRefund();assert.match(h.calls.modal[0].content,/不发生真实退款/);
});
test('ordinary payment still uses WeChat, missing payment parameters cannot be reported paid',()=>{
  const{h,p,payments}=ready(false);let called=0;h.wx.login=options=>{called++;options.success({code:'isolated-login-code'});};
  p.handlePay();assert.doesNotMatch(h.calls.modal[0].content,/模拟/);h.calls.modal[0].success({confirm:true});
  assert.equal(called,1);assert.ok(h.calls.request[1].url.endsWith('/auth/code2session'));
  h.respond(1,{openid:'isolated-openid'});assert.ok(h.calls.request[2].url.endsWith('/deposits/create'));
  h.respond(2,{});assert.match(h.calls.toast.at(-1).title,/参数未确认/);assert.equal(payments(),0);
});
