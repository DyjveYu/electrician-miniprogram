const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = filename => fs.readFileSync(path.join(__dirname, '..', filename), 'utf8');

test('waiting notices in lists and details contain text only', () => {
  const template = read('components/dispatch-wait/index.wxml');
  assert.match(template, /系统会继续推荐/);
  assert.match(template, /refundLabel/);
  assert.doesNotMatch(template, /<button|data-action/);
  assert.doesNotMatch(read('pages/order/list/list.wxml'), /取消订单|继续等待/);
});

test('customer offsite cancellation, payment and rating actions are in the fixed footer', () => {
  const template = read('components/offsite-order/index.wxml');
  const footer = template.indexOf('class="bottom-bar"');
  for (const action of ['cancel', 'payDeposit', 'payFee', 'closeFee', 'delivery', 'review']) {
    const handler = `bindtap="${action}"`;
    assert.ok(template.indexOf(handler) > footer, action);
    assert.equal(template.split(handler).length - 1, action === 'closeFee' ? 2 : 1);
  }
  for (const view of ['pages/order/detail/detail.wxml', 'pages/order-landing-detail/index.wxml']) {
    const source = read(view);
    assert.ok(source.indexOf('owner-actions="{{true}}"') > source.indexOf('class="bottom-bar"'));
  }
});
