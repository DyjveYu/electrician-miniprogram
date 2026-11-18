const test = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./helpers/contentHarness');
const flush = async () => { for(let i=0;i<20;i++)await Promise.resolve(); };
const template = 'SdTx8YNPSsfCEkKokvoKX-M60jYbcj4FtseszdbUOUw';
function setup(){
  const h=harness();h.login('electrician');const p=h.page('pages/index/index.js');
  p.setData({currentRole:'electrician',orderSubscriptionEnabled:true,orderSubscriptionTemplate:template});
  const subscription=h.load('utils/orderSubscription.js'),api=h.load('utils/api.js').API;
  const prompts=[],logins=[],requests=[];
  h.wx.requestSubscribeMessage=o=>prompts.push(o);h.wx.login=o=>logins.push(o);
  api.request=async body=>{requests.push(body);return{code:200,data:{recorded:true}};};
  return{h,p,subscription,api,prompts,logins,requests};
}
test('configuration load never opens a WeChat authorization dialog',async()=>{
  const {p,subscription,api,prompts}=setup();api.request=async()=>({code:200,data:{enabled:true,templateId:template}});
  await subscription.load(p);assert.equal(p.data.orderSubscriptionEnabled,true);assert.equal(prompts.length,0);
});
test('home refresh loads notification capability independently of nearby-list failure',async()=>{
  const {p,api,prompts,h}=setup();let configRequests=0;
  const orderApi=h.load('utils/api.js').OrderAPI;
  orderApi.getOrderList=async()=>{throw new Error('list unavailable');};
  api.request=async()=>{configRequests++;return{code:200,data:{enabled:true,templateId:template}};};
  await p.loadData();assert.equal(configRequests,1);assert.equal(p.data.orderSubscriptionEnabled,true);assert.equal(prompts.length,0);
});
test('unconfigured feature stays hidden and cannot authorize',async()=>{
  const {p,subscription,api,prompts}=setup();api.request=async()=>({code:200,data:{enabled:false,templateId:null}});
  await subscription.load(p);p.subscribeNewOrders();assert.equal(p.data.orderSubscriptionEnabled,false);assert.equal(prompts.length,0);
});
test('stale configuration cannot enable another identity',async()=>{
  const {h,p,subscription,api}=setup();let finish;api.request=()=>new Promise(r=>finish=r);
  const load=subscription.load(p);h.login('user');finish({code:200,data:{enabled:true,templateId:template}});await load;
  assert.equal(p.data.orderSubscriptionEnabled,false);
  await subscription.load(p);assert.equal(p.data.orderSubscriptionEnabled,false);
});
test('new account capability refresh clears an old pending authorization button',async()=>{
  const {h,p,subscription,api,prompts,logins}=setup();
  api.request=async()=>({code:200,data:{enabled:true,templateId:template}});await subscription.load(p);
  p.subscribeNewOrders();assert.equal(p.data.orderSubscriptionBusy,true);
  h.app.globalData.token='another-session';await subscription.load(p);assert.equal(p.data.orderSubscriptionBusy,false);
  prompts[0].success({[template]:'accept'});assert.equal(logins.length,0);
});
test('only explicit click requests one exact template, duplicate click is blocked',()=>{
  const {p,prompts}=setup();p.subscribeNewOrders();p.subscribeNewOrders();assert.equal(prompts.length,1);
  assert.equal(prompts[0].tmplIds[0],template);assert.equal(p.data.orderSubscriptionBusy,true);
});
for(const result of ['reject','ban',undefined])test('subscription '+result+' leaves normal browsing intact and records no permission',()=>{
  const {h,p,prompts,logins,requests}=setup();p.subscribeNewOrders();prompts[0].success({[template]:result});
  assert.equal(logins.length,0);assert.equal(requests.length,0);assert.equal(p.data.orderSubscriptionBusy,false);assert.equal(h.calls.toast.at(-1).title,'未订阅，仍可正常接单');
});
test('accepted consent uses wx.login code, waits for durable server receipt and never sends client openid',async()=>{
  const {h,p,prompts,logins,requests}=setup();p.subscribeNewOrders();prompts[0].success({[template]:'accept'});
  assert.equal(h.calls.toast.length,0);logins[0].success({code:'isolated-code'});await flush();
  assert.equal(requests.length,1);assert.equal(requests[0].data.login_code,'isolated-code');assert.equal(requests[0].data.template_id,template);
  assert.equal(requests[0].data.openid,undefined);assert.match(requests[0].data.request_key,/^[a-zA-Z0-9_-]{16,64}$/);
  assert.equal(h.calls.toast.at(-1).title,'本次订阅已记录');assert.equal(p.data.orderSubscriptionBusy,false);
});
for(const stage of ['before-consent','before-login','before-record'])test('logout at '+stage+' cannot record consent or show late success',async()=>{
  const {h,p,prompts,logins,api,requests}=setup();let finish;
  api.request=body=>{requests.push(body);return new Promise(r=>finish=r);};p.subscribeNewOrders();
  if(stage==='before-consent'){h.app.globalData.token='new-session';prompts[0].success({[template]:'accept'});assert.equal(logins.length,0);}
  else{
    prompts[0].success({[template]:'accept'});
    if(stage==='before-login'){h.app.globalData.token='new-session';logins[0].success({code:'code'});assert.equal(requests.length,0);}
    else{logins[0].success({code:'code'});h.app.globalData.token='new-session';finish({code:200,data:{recorded:true}});await flush();}
  }
  assert.equal(h.calls.toast.length,0);
});
test('hide and show invalidate an earlier consent callback in the same account',()=>{
  const {p,prompts,logins}=setup();p.subscribeNewOrders();p.onHide();p._subscriptionVisible=true;
  prompts[0].success({[template]:'accept'});assert.equal(logins.length,0);assert.equal(p.data.orderSubscriptionBusy,false);
});
test('HTTP200 business failure cannot display subscription success',async()=>{
  const {h,p,prompts,logins,api}=setup();api.request=async()=>({code:200,success:false,message:'身份不匹配'});
  p.subscribeNewOrders();prompts[0].success({[template]:'accept'});logins[0].success({code:'code'});await flush();
  assert.equal(h.calls.toast.at(-1).title,'身份不匹配');assert.equal(p.data.orderSubscriptionBusy,false);
});
test('lost receipt retries the same request key once',async()=>{
  const {h,p,prompts,logins,api,requests}=setup();api.request=async body=>{requests.push(body);if(requests.length===1)throw new Error('network');return{code:200,data:{recorded:true}};};
  p.subscribeNewOrders();prompts[0].success({[template]:'accept'});logins[0].success({code:'code'});await flush();
  assert.equal(requests.length,2);assert.equal(requests[0].data.request_key,requests[1].data.request_key);assert.equal(h.calls.toast.at(-1).title,'本次订阅已记录');
});
test('definite server rejection is not retried as a network error',async()=>{
  const {p,prompts,logins,api,requests}=setup();api.request=async body=>{requests.push(body);throw Object.assign(new Error('denied'),{code:403});};
  p.subscribeNewOrders();prompts[0].success({[template]:'accept'});logins[0].success({code:'code'});await flush();assert.equal(requests.length,1);
});
test('unsupported client and native authorization failure restore button without order calls',()=>{
  const {h,p,prompts,requests}=setup();p.subscribeNewOrders();prompts[0].fail({errMsg:'cancel'});assert.equal(p.data.orderSubscriptionBusy,false);
  delete h.wx.requestSubscribeMessage;p.subscribeNewOrders();assert.equal(h.calls.toast.at(-1).title,'当前微信版本不支持订阅');assert.equal(requests.length,0);
});
test('owner accepts template745 for the original order, using independent server capability and scope',async()=>{
  const {h,p,subscription,api,prompts,logins,requests}=setup();h.login('user');
  p.setData({orderSubscriptionType:'accepted',orderId:10});
  api.request=async body=>{requests.push(body);return body.method==='POST'?{code:200,data:{recorded:true}}:{code:200,data:{enabled:true,templateId:'42uNrzpSAUS7APu9fpP-8vXWH_dQUsRN3Dp5zy-8yVo'}};};
  await subscription.load(p);assert.match(requests[0].url,/type=accepted/);
  p.subscribeNewOrders();const ownerTemplate=p.data.orderSubscriptionTemplate;prompts[0].success({[ownerTemplate]:'accept'});logins[0].success({code:'owner-code'});await flush();
  const payload=requests.at(-1).data;assert.equal(payload.event_type,'accepted');assert.equal(payload.order_id,10);assert.equal(payload.template_id,ownerTemplate);
  assert.equal(h.calls.toast.at(-1).title,'本次订阅已记录');
});
test('owner rejection is optional and an electrician cannot subscribe to an owner event',()=>{
  const {h,p,prompts,subscription}=setup();p.setData({orderSubscriptionType:'accepted',orderId:10});
  subscription.subscribe(p);assert.equal(prompts.length,0);
  h.login('enterprise');subscription.subscribe(p);prompts[0].success({[template]:'reject'});
  assert.equal(h.calls.toast.at(-1).title,'未订阅，不影响订单');
});
