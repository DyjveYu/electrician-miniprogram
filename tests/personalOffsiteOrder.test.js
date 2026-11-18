const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { harness } = require('./helpers/contentHarness');
const flush = async () => { for (let i=0;i<24;i++) await Promise.resolve(); };
const address={id:2,province:'测试省',city:'测试市',district:'测试区',detail_address:'测试路',contact_name:'测试用户',contact_phone:'13900000111'};
const order=(extra={})=>({id:10,order_type:'personal_quick',service_mode:'off_site',pricing_mode:'fixed_deposit',required_cert_type:'construction',status:'pending_repair_payment',prepay_amount:200,final_amount:300,fee_revision:1,fee_confirmed_revision:1,
  offsite_finance:{depositAmount:200,depositPaid:true,refundState:'not_due',feeAmount:300,feeRevision:1,confirmedRevision:1,feePaid:false,electricianAmount:255},...extra});
async function createForm(){
  const h=harness();h.login('user');const p=h.page('pages/order/create/create.js');p.onLoad({});p.onShow();
  h.respond(h.calls.request.findIndex(r=>r.url.includes('/addresses?page=')),{addresses:[address],pagination:{total:1,pages:1}});
  h.respond(h.calls.request.findIndex(r=>r.url.endsWith('/addresses/default')),{address});await flush();
  p.setData({description:'技术服务',requiredCertType:'construction'});p.onServiceModeChange({detail:{value:'off_site'}});return{h,p};
}
test('offsite requires a selected address and retains address errors',async()=>{
  const h=harness();h.login('user','13900000111');const p=h.page('pages/order/create/create.js');p.onLoad({});p.onShow();
  const pending=h.calls.request.filter(r=>r.url.includes('/addresses'));
  p.onServiceModeChange({detail:{value:'off_site'}});p.setData({description:'测试加工',requiredCertType:'construction'});p.updateSubmitEnable();
  assert.equal(p.data.canSubmit,false);assert.equal(p.validateForm(),false);
  for(const request of pending)request.fail({errMsg:'request:fail'});await flush();
  assert.equal(p.data.showAddressSheet,true);assert.ok(p.data.addressError);
  await p.submitOrder();assert.equal(h.calls.request.some(r=>r.url.endsWith('/orders')),false);
});
test('service mode changes preserve selected address and contact snapshot',async()=>{
  const {h,p}=await createForm();assert.equal(p.data.selectedAddress.id,2);assert.equal(p.data.canSubmit,true);
  p.onServiceModeChange({detail:{value:'on_site'}});assert.equal(p.data.selectedAddress.id,2);assert.equal(p.data.canSubmit,true);
  p.onServiceModeChange({detail:{value:'off_site'}});await p.submitOrder();
  const body=h.calls.request.find(r=>r.url.endsWith('/orders')).data;
  assert.equal(body.address_id,2);assert.equal(body.contact_phone,address.contact_phone);assert.match(body.service_address,/测试路/);
});
test('a personal account without addresses is guided to add one and cannot bypass via offsite mode',async()=>{
  const h=harness();h.login('user');const p=h.page('pages/order/create/create.js');p.onLoad({});p.onShow();
  h.respond(h.calls.request.findIndex(r=>r.url.includes('/addresses?page=')),{addresses:[],pagination:{total:0,pages:0}});
  h.respond(h.calls.request.findIndex(r=>r.url.endsWith('/addresses/default')),{address:null});await flush();
  assert.equal(h.calls.navigate.length,1);assert.match(h.calls.navigate[0].url,/address\/edit/);
  p.setData({description:'测试加工',requiredCertType:'construction'});p.onServiceModeChange({detail:{value:'off_site'}});assert.equal(p.data.canSubmit,false);
});
function widget(role='user',extra={}){
  const h=harness();h.login(role);const methods=h.component('components/offsite-order/index.js');
  const raw=order(extra), events=[];
  const p={...methods,_active:true,_generation:0,data:{order:{...raw,...h.load('utils/personalOrder.js').labels(raw)},role,busy:false,amount:'300.00',content:'已完成服务',images:[],rating:5,comment:''},
    setData(value){Object.assign(this.data,value);},triggerEvent(name){events.push(name);}};
  return{h,p,events};
}
test('personal offsite creates original fixed deposit order and modal with server 200, enterprise still blocked',async()=>{
  const{h,p}=await createForm();assert.equal(p.data.canSubmit,true);await p.submitOrder();
  const i=h.calls.request.findIndex(r=>r.url.endsWith('/orders'));const body=h.calls.request[i].data;
  assert.equal(body.service_mode,'off_site');assert.equal(body.pricing_mode,'fixed_deposit');assert.equal(body.required_cert_type,'construction');
  h.respond(i,{id:10,prepay_amount:200});assert.equal(p.data.createdPrepayAmount,'200.00');assert.equal(p.data.createdIsOffsite,true);assert.equal(p.data.showPrepay,true);
  p.onServiceModeChange({detail:{value:'on_site'}});assert.equal(p.data.serviceMode,'off_site');
  const other=await createForm();other.p.setData({userType:'enterprise'});other.p.updateSubmitEnable();assert.equal(other.p.data.canSubmit,false);
});
test('fee confirmation includes exact revision before navigating to independent repair payment',async()=>{
  const{h,p}=widget();const work=p.payFee();h.calls.modal.at(-1).success({confirm:true});await flush();
  const request=h.calls.request.at(-1);assert.ok(request.url.endsWith('/orders/10/offsite/confirm-fee'));assert.equal(request.data.fee_revision,1);
  assert.equal(h.calls.navigate.length,0);h.respond(h.calls.request.length-1,{});await work;
  assert.equal(h.calls.navigate.at(-1).url,'/pages/payment/payment/payment?orderId=10&type=repair');
});
for(const change of ['logout','hide'])test('late fee confirmation cannot navigate after '+change,async()=>{
  const{h,p}=widget();const work=p.payFee();h.calls.modal.at(-1).success({confirm:true});await flush();
  if(change==='logout')h.app.globalData.token='another-session';else p.pageLifetimes.hide.call(p);
  h.respond(h.calls.request.length-1,{});await work;assert.equal(h.calls.navigate.length,0);
  if(change==='hide'){p.pageLifetimes.show.call(p);assert.equal(p.data.busy,false);}
});
test('hidden confirmation dialog cannot dispatch payment or quote request',async()=>{
  const{h,p}=widget('electrician');const work=p.quote();p.pageLifetimes.hide.call(p);h.calls.modal.at(-1).success({confirm:true});await work;
  assert.equal(h.calls.request.length,0);
});
test('HTTP200 business failure is rejected without navigation or refresh success',async()=>{
  const{h,p,events}=widget();const work=p.payFee();h.calls.modal.at(-1).success({confirm:true});await flush();
  h.calls.request.at(-1).success({statusCode:200,data:{code:200,success:false,message:'工费版本已变化'}});await work;
  assert.equal(h.calls.navigate.length,0);assert.equal(events.length,0);assert.match(h.calls.modal.at(-1).content,/版本/);
});
for(const amount of ['0','-1','300.001','100000000','1e3'])test('invalid fee '+amount+' never leaves client',async()=>{
  const{h,p}=widget('electrician');p.data.amount=amount;await p.quote();assert.equal(h.calls.request.length,0);
});
test('two taps submit only one completed-work quote, fee does not subtract deposit',async()=>{
  const{h,p}=widget('electrician');const first=p.quote();p.quote();assert.equal(h.calls.modal.length,1);
  h.calls.modal[0].success({confirm:true});await flush();assert.equal(h.calls.request.length,1);
  assert.equal(h.calls.request[0].data.amount,'300.00');h.respond(0,{});await first;assert.equal(p.data.busy,false);
});
test('refresh checks original payments then original refund; it does not create a fee charge',async()=>{
  const{h,p}=widget();const work=p.refreshFunds();await flush();assert.ok(h.calls.request[0].url.endsWith('/offsite/check-payments'));
  h.respond(0,{});await flush();assert.ok(h.calls.request[1].url.endsWith('/offsite/refund'));h.respond(1,{});await work;
  assert.equal(h.calls.request.some(r=>r.url.endsWith('/payments')),false);
});
test('independent offsite fee payment is bound to saved version and waits for real server paid fact',async()=>{
  const h=harness();h.login('user');h.app.globalData.paymentMethod='test';const api=h.load('utils/api.js').PaymentAPI;let payload;
  api.createPayment=async body=>{payload=body;return{code:200,data:{success:true,payment_no:'isolated-fee',amount:300}};};
  api.confirmTestPayment=async()=>({code:200});api.queryPayment=async()=>({code:200,data:{status:'success'}});
  const p=h.page('pages/payment/payment/payment.js');p.onLoad({orderId:'10',type:'repair'});h.respond(0,{order:order()});await flush();
  assert.equal(payload.type,'repair');assert.equal(payload.fee_revision,1);assert.equal(p.data.safePayment,true);assert.equal(p.data.offsitePayment,true);
  const check=h.calls.request.findIndex((r,i)=>i>0&&r.url.endsWith('/orders/10'));
  assert.ok(check>0);assert.equal(h.calls.redirect.length,0);
  h.respond(check,{order:order({has_paid_repair:true,status:'pending_review'})});await flush();
  assert.equal(h.calls.redirect.at(-1).url,'/pages/order/detail/detail?id=10');
});
test('home displays at most three national records and does not require regional lookup',async()=>{
  const h=harness();h.login();const p=h.page('pages/index/index.js');const work=p.loadNationalOrders();
  assert.equal(h.calls.request.length,1);assert.match(h.calls.request[0].url,/order_scope=nationwide/);
  h.respond(0,{list:[1,2,3,4].map(id=>order({id,status:'pending',created_at:'2026-11-17T08:30:00+08:00'})),pages:1});await work;assert.equal(p.data.nationalOrders.length,3);
  assert.equal(p.data.nationalOrders[0].offsiteFeeName,'300.00');
  assert.equal(p.data.nationalOrders[0].statusText,'待接单');assert.equal(p.data.nationalOrders[0].orderTypeText,'个人不上门订单');
  assert.match(p.data.nationalOrders[0].createdTime,/2026-11-17/);
});
test('national malformed or failed response is visible error, not empty success',async()=>{
  const h=harness();h.login();const p=h.page('pages/order/nationwide/nationwide.js');p.onLoad();
  h.respond(0,{unexpected:true});await flush();assert.match(p.data.error,/响应未确认/);assert.equal(p.data.orders.length,0);
});
test('national pagination keeps server scope and discards response after leaving',async()=>{
  const h=harness();h.login();const p=h.page('pages/order/nationwide/nationwide.js');p.onLoad();
  h.respond(0,{list:[order()],pages:2});await flush();assert.equal(p.data.hasMore,true);p.onReachBottom();
  assert.equal(h.calls.request[1].data.page,2);assert.equal(h.calls.request[1].data.order_scope,'nationwide');p.onHide();h.respond(1,{list:[order({id:11})],pages:2});await flush();assert.equal(p.data.orders.length,1);
});
test('presentation separates returned deposit from paid fee and zero platform-double-count',()=>{
  const{h}=widget();const labels=h.load('utils/personalOrder.js').labels(order({offsite_finance:{feeAmount:300,electricianAmount:255,refundState:'success'}}));
  assert.equal(labels.offsiteFeeName,'300.00');assert.equal(labels.offsiteElectricianName,'255.00');assert.equal(labels.offsiteRefundName,'押金已原路退回');
  for(const file of ['pages/order/detail/detail.wxml','pages/order-landing-detail/index.wxml']){
    const text=fs.readFileSync(path.resolve(__dirname,'..',file),'utf8');assert.ok(text.includes('<offsite-order'));assert.ok(text.includes('!order.isOffsite'));
  }
});
test('my orders distinguishes offsite personal orders while preserving onsite and enterprise names',()=>{
  const h=harness();h.login('user');h.app.globalData.currentRole='user';
  const p=h.page('pages/order/list/list.js');p.loadOrders();
  h.respond(0,{list:[order({status:'pending'}),order({id:11,service_mode:'on_site',pricing_mode:null}),
    {id:12,order_type:'enterprise_quick',status:'pending'},{id:13,order_type:'enterprise_project',status:'recruiting'}]});
  const names=Object.fromEntries(p.data.orders.map(item=>[item.id,item.orderTypeText]));
  assert.equal(names[10],'个人不上门订单');assert.equal(names[11],'个人快修订单');
  assert.equal(names[12],'企业快修订单');assert.equal(names[13],'企业多日工程');
});
for(const file of ['pages/order/detail/detail.js','pages/order-landing-detail/index.js']) {
  test(file+' keeps the offsite name and service stage when normalizing detail response',()=>{
    const h=harness();h.login('user');h.app.globalData.currentRole='user';const p=h.page(file);p.onLoad({id:'10'});
    h.respond(0,{order:order({status:'in_progress',contact_name:'测试用户',contact_phone:'13900000111',service_address:'测试地址',images:[],repair_images:[]})});
    assert.equal(p.data.order.orderTypeText,'个人不上门订单');assert.equal(p.data.order.offsiteStatusName,'服务中');
    assert.equal(p.data.order.isOffsite,true);assert.equal(p.data.order.offsiteFeeName,'300.00');
  });
}
test('offsite description and completed evidence preview uses the selected original image',()=>{
  const{h,p}=widget();let shown;h.wx.previewImage=value=>{shown=value;};
  p.previewImage({currentTarget:{dataset:{src:'https://example.test/work-2.jpg',urls:['https://example.test/work-1.jpg','https://example.test/work-2.jpg']}}});
  assert.equal(shown.current,'https://example.test/work-2.jpg');assert.equal(shown.urls.length,2);
});
test('late 401 from old payment cannot log out newly selected identity',async()=>{
  const h=harness();h.login('user');const api=h.load('utils/api.js').API;let loggedOut=0;h.app.logout=()=>loggedOut++;
  const work=api.request({method:'POST',url:'/payments',data:{order_id:10},showError:false}).catch(error=>error);
  h.app.globalData.token='new-session-token';h.calls.request[0].success({statusCode:401,data:{message:'旧登录过期'}});
  const error=await work;assert.equal(error.stale,true);assert.equal(loggedOut,0);
});
test('optional service proof upload reaches the quoted original order and can be removed',async()=>{
  const{h,p}=widget('electrician');h.wx.chooseImage=opts=>opts.success({tempFilePaths:['isolated-image.jpg']});
  h.load('utils/api.js').API.uploadFile=async()=>({code:200,data:{url:'/uploads/isolated-proof.jpg'}});
  p.chooseImages();await flush();assert.equal(p.data.images.length,1);
  const work=p.quote();h.calls.modal.at(-1).success({confirm:true});await flush();assert.equal(h.calls.request[0].data.repair_images[0],'/uploads/isolated-proof.jpg');h.respond(0,{});await work;
  p.removeImage({currentTarget:{dataset:{index:0}}});assert.equal(p.data.images.length,0);
});
