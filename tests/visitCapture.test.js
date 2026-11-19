const test = require('node:test');
const assert = require('node:assert/strict');
const { harness } = require('./helpers/contentHarness');
const fs = require('node:fs');
const path = require('node:path');

test('all manifest pages report through the shared lifecycle and server allowlist', () => {
  const root = path.resolve(__dirname, '..');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
  const allow = JSON.parse(fs.readFileSync(path.join(root, '../backend/src/config/miniappVisitRoutes.json'), 'utf8'));
  assert.deepEqual([...manifest.pages].sort(), allow);
  for (const page of manifest.pages) {
    assert.match(fs.readFileSync(path.join(root, page + '.js'), 'utf8'), /visitCapture'\)\.register\(Page,/);
  }
});

test('navigation, retry, guest conversion and logout preserve their respective event boundaries', () => {
  const h = harness(), capture = h.load('utils/visitCapture.js');
  const original = { onShow(value) { return value; } };
  const page = route => ({ ...capture.register(definition => definition, original), route });
  const a = page('pages/index/index'), b = page('pages/content/notice-detail/index');
  h.app.globalData.baseUrl = 'https://local.invalid/api';
  const flush = () => { while (h.timers.length) h.timers.shift()(); };
  assert.equal(a.onShow(7), 7);
  a.onShow();
  flush();
  assert.equal(h.calls.request.length, 1);
  h.calls.request[0].fail();
  flush();
  assert.equal(h.calls.request[1].data.eventId, h.calls.request[0].data.eventId);
  h.calls.request[1].success({ statusCode: 204 });
  h.login('user', '13800138000');
  b.onShow();
  flush();
  assert.equal(h.calls.request[2].data.sessionId, h.calls.request[0].data.sessionId);
  assert.ok(h.calls.request[2].header.Authorization);
  b.onUnload();
  a.onShow();
  flush();
  assert.notEqual(h.calls.request[3].data.eventId, h.calls.request[0].data.eventId);
  capture.resetSession();
  h.app.globalData.userInfo = null;
  h.app.globalData.token = null;
  b.onShow();
  flush();
  assert.notEqual(h.calls.request[4].data.sessionId, h.calls.request[0].data.sessionId);
  assert.equal(h.calls.request[4].data.visitorId, h.calls.request[0].data.visitorId);
  assert.equal(h.calls.request[4].header.Authorization, undefined);
  assert.deepEqual(Object.keys(h.calls.request[4].data).sort(), ['eventId', 'route', 'sessionId', 'visitorId']);
});
