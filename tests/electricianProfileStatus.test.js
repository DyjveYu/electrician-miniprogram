const test = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./helpers/contentHarness');
function start() {
  const h = harness(); h.login('electrician');
  h.wx.stopPullDownRefresh = () => {};
  const page = h.page('pages/profile/profile/profile.js');
  for (const method of ['loadWalletInfo', 'loadDepositStatus', 'loadPartnerStatus', 'loadReferrerStatus']) page[method] = () => {};
  page.onLoad();
  return { h, page };
}
function user(status, text) {
  return { user: { id: 1, current_role: 'electrician', status: 'active', certificationStatus: status,
    certificationStatusText: text, isElectrician: status === 'approved' }, certification: { status }, stats: {} };
}
for (const [status, text] of [['rejected', '待补充资料'], ['pending', '待补充资料'], ['pending', '区域变更待审核'],
  ['approved', '已认证'], ['rejected', '未通过'], ['unverified', '未认证']]) {
  test(`我的页展示服务端状态 ${status} / ${text}，不改变真实认证资格`, () => {
    const { h, page } = start();
    h.respond(0, user(status, text));
    assert.equal(page.data.certificationStatusText, text);
    assert.equal(page.getCertificationStatusText(), text);
    assert.equal(page.data.userInfo.certificationStatus, status);
    assert.equal(page.data.userInfo.isElectrician, status === 'approved');
  });
}
test('返回我的页刷新后，迟到的旧认证状态不能覆盖新的区域待审状态', () => {
  const { h, page } = start();
  page.onShow();
  h.respond(1, user('pending', '区域变更待审核'));
  h.respond(0, user('approved', '已认证'));
  assert.equal(page.data.certificationStatusText, '区域变更待审核');
  assert.equal(h.app.globalData.userInfo.certificationStatus, 'pending');
});
