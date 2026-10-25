const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { configure, validate } = require('../scripts/configure-runtime');
const resolve = require('../config/resolve');
const production = require('../config/production');
const local = { enabled: true, version: 'v1.2.0', baseUrl: 'http://127.0.0.1:3000/api', imageBaseUrl: 'http://127.0.0.1:3000', paymentMethod: 'test' };
const wxEnv = envVersion => ({ getAccountInfoSync: () => ({ miniProgram: { envVersion } }) });

test('develop显式启用本地覆盖，正式默认对象不被修改', () => {
  const before = JSON.stringify(production);
  assert.deepEqual(resolve(wxEnv('develop'), local), Object.fromEntries(Object.keys(production).map(key => [key, local[key]])));
  assert.equal(JSON.stringify(production), before);
});
test('trial/release/环境未知或检测失败始终使用正式微信支付配置', () => {
  for (const version of ['trial', 'release', '', 'unknown']) assert.deepEqual(resolve(wxEnv(version), local), production);
  assert.deepEqual(resolve({}, local), production);
  assert.equal(resolve(wxEnv('release'), local).paymentMethod, 'wechat');
});
test('本地关闭或仅部分覆盖时保持其他正式默认字段', () => {
  assert.deepEqual(resolve(wxEnv('develop'), { ...local, enabled: false }), production);
  assert.deepEqual(resolve(wxEnv('develop'), { enabled: true, version: 'v9.0.0' }), { ...production, version: 'v9.0.0' });
});
test('配置拒绝未知字段、凭据URL、错协议、无效支付开关与API路径', () => {
  for (const value of [{ ...local, token: 'secret' }, { ...local, enabled: 'true' }, { ...local, paymentMethod: 'fake' },
    { ...local, baseUrl: 'https://user:password@example.invalid/api' }, { ...local, imageBaseUrl: 'javascript:alert(1)' },
    { ...local, baseUrl: 'http://127.0.0.1:3000/no-api' }, { ...local, version: 'bad' }]) assert.throws(() => validate(value));
});
test('新克隆无需local.json也可生成纯正式运行时，原本地配置不覆盖', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'm1-runtime-'));
  configure({ root, production: true });
  assert.deepEqual(require(path.join(root, 'config/runtime.generated.js')), { enabled: false });
  fs.writeFileSync(path.join(root, 'config/local.json'), JSON.stringify(local));
  configure({ root, production: true });
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'config/local.json'))), local);
});
test('初始化不覆盖已有本地设置，重跑生成器刷新运行时文件', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'm1-runtime-'));
  configure({ root, init: true });
  const file = path.join(root, 'config/local.json');
  assert.equal(JSON.parse(fs.readFileSync(file)).enabled, false);
  fs.writeFileSync(file, JSON.stringify(local));
  configure({ root, init: true });
  assert.deepEqual(JSON.parse(fs.readFileSync(file)), local);
  assert.match(fs.readFileSync(path.join(root, 'config/runtime.generated.js'), 'utf8'), /"paymentMethod": "test"/);
});
test('无本地文件或配置损坏时失败，不覆盖既有有效运行时', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'm1-runtime-'));
  assert.throws(() => configure({ root }), /缺少/);
  configure({ root, production: true });
  const target = path.join(root, 'config/runtime.generated.js');
  const before = fs.readFileSync(target, 'utf8');
  fs.writeFileSync(path.join(root, 'config/local.json'), '{bad');
  assert.throws(() => configure({ root }));
  assert.equal(fs.readFileSync(target, 'utf8'), before);
});
test('本地原始JSON不打包；生成模块保留，保证静态require可解析', () => {
  const config = require('../project.config.json');
  assert.ok(config.packOptions.ignore.some(item => item.type === 'file' && item.value === 'config/local.json'));
  assert.ok(!config.packOptions.ignore.some(item => item.value === 'config' || item.value === 'config/runtime.generated.js'));
});
