const test = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./helpers/contentHarness');

const files = ['pages/order/detail/detail.js', 'pages/order-landing-detail/index.js'];
function setup(file) {
  const h = harness(); h.login();
  const page = h.page(file); page.setData({ orderId: '11', order: { id: 11, status: 'recruiting', canAccept: true } });
  const submit = () => {
    page.acceptOrder(); h.calls.modal.findLast(row => row.title === '确认接单').success({ confirm: true });
    return h.calls.request.at(-1);
  };
  return { h, page, submit };
}
for (const file of files) {
  for (const reason of ['ORDER_QUALIFICATION_MISMATCH', 'ORDER_OUTSIDE_BASE_REGION', 'ORDER_REGION_UNAVAILABLE', 'ORDER_NOT_AVAILABLE', 'ORDER_PROJECT_FULL']) {
    test(`${file} ${reason}: real failure, refresh guidance and no second POST`, () => {
      const { h, page, submit } = setup(file);
      submit().success({ statusCode: 200, data: { code: 403, data: { reason } } });
      assert.equal(page.data.takeBlocked, true); assert.equal(page.data.taking, false);
      const message = h.calls.modal.at(-1); assert.equal(message.title, '暂无法接单'); assert.match(message.content, /刷新/);
      page.acceptOrder(); assert.equal(h.calls.request.length, 1);
      assert.equal(h.calls.toast.some(row => row.title === '接单成功'), false);
      message.success({ confirm: true }); assert.equal(h.calls.switchTab.at(-1).url, '/pages/index/index');
    });
  }
  for (const response of [
    { statusCode: 200, data: { success: false, code: 200, message: '业务失败' } },
    { statusCode: 200, data: { code: 403, message: '需要缴纳押金后才能接单，请先缴纳押金' } },
    { statusCode: 200, data: {} }, { statusCode: 403, data: { success: true, code: 200 } }
  ]) test(`${file} refuses false success: ${JSON.stringify(response)}`, () => {
    const { h, page, submit } = setup(file); submit().success(response);
    assert.equal(page.data.takeSucceeded, false); assert.equal(page.data.taking, false);
    assert.notEqual(h.calls.toast.at(-1)?.title, '接单成功');
    if (response.data.message) assert.equal(h.calls.toast.at(-1).title, response.data.message);
  });
  test(`${file} repeated tap while POST is pending and after success does not submit again`, () => {
    const { h, page, submit } = setup(file); const request = submit();
    page.acceptOrder(); assert.equal(h.calls.request.length, 1);
    request.success({ statusCode: 200, data: { code: 200 } });
    assert.equal(page.data.takeSucceeded, true); page.acceptOrder(); assert.equal(h.calls.request.length, 1);
  });
  test(`${file} unknown network result only rereads original order`, () => {
    const { h, page, submit } = setup(file); submit().fail({ errMsg: 'request:fail timeout' });
    assert.equal(page.data.takeSucceeded, false); assert.equal(page.data.taking, false);
    assert.equal(h.calls.request.filter(row => row.method === 'POST').length, 1);
    assert.equal(h.calls.request.at(-1).url.endsWith('/orders/11'), true);
    assert.equal(h.calls.request.at(-1).method, 'GET');
  });
  test(`${file} cancelled confirmation allows next real attempt`, () => {
    const { h, page, submit } = setup(file); page.acceptOrder();
    h.calls.modal.findLast(row => row.title === '确认接单').success({ confirm: false });
    submit(); assert.equal(h.calls.request.length, 1);
  });
}
test('order message opens saved original order without submitting or preallocating a slot', () => {
  const h = harness(); h.login();
  const page = h.page('pages/message/detail/detail.js'); page.setData({ message: { orderId: 11, related_id: 11 } });
  page.viewOrder({ currentTarget: { dataset: {} } });
  assert.equal(h.calls.navigate.at(-1).url, '/pages/order/detail/detail?id=11'); assert.equal(h.calls.request.length, 0);
});
test('landing project withdrawal permits a new deliberate registration after successful withdrawal', () => {
  const { h, page, submit } = setup('pages/order-landing-detail/index.js');
  submit().success({ statusCode: 200, data: { code: 200 } });
  page.withdrawOrder(); h.calls.modal.findLast(row => row.title === '确认退单').success({ confirm: true });
  h.calls.request.at(-1).success({ statusCode: 200, data: { code: 403, message: '退单失败' } });
  assert.equal(page.data.takeSucceeded, true);
  page.withdrawOrder(); h.calls.modal.findLast(row => row.title === '确认退单').success({ confirm: true });
  h.calls.request.at(-1).success({ statusCode: 200, data: { code: 200 } });
  assert.equal(page.data.takeSucceeded, false); submit();
  assert.equal(h.calls.request.filter(row => row.url.endsWith('/take')).length, 2);
});
