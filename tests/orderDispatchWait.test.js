const test=require('node:test');
const assert=require('node:assert/strict');
const {harness}=require('./helpers/contentHarness');

test('continue sends only current stage to the original order and reloads after server success',async()=>{
  const h=harness(); h.login('enterprise');
  const events=[];
  const component={...h.component('components/dispatch-wait/index.js'),data:{order:{id:10,dispatch_wait:{choiceStage:30,amount:100}}},
    setData(patch){Object.assign(this.data,patch);},triggerEvent(name){events.push(name);}};
  const req=component.choose({currentTarget:{dataset:{action:'continue'}}});
  assert.ok(h.calls.request[0].url.endsWith('/orders/10/dispatch-wait'));
  assert.equal(h.calls.request[0].data.stage,30);
  assert.equal(h.calls.request[0].data.action,'continue');
  await component.choose({currentTarget:{dataset:{action:'continue'}}});
  assert.equal(h.calls.request.length,1);
  assert.deepEqual(events,[]);
  h.respond(0,{choiceStage:null});
  await req;
  assert.deepEqual(events,['refresh']);
});
