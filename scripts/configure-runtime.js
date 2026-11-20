// 修改日期：2026-11-12。Node 工具，只生成配置，不连接服务器或上传小程序。
// 无参数：读取个人 local.json；--init：首次初始化；--production：关闭个人覆盖。
// --production 是打包准备参数，不把体验版强制改成生产地址。
// 实际运行时：develop 读本地生成值，trial 读 trial.js，release 读 production.js。
const fs = require('node:fs');
const path = require('node:path');
const defaultRoot = path.resolve(__dirname, '..');
const allowed = ['enabled', 'version', 'baseUrl', 'imageBaseUrl', 'paymentMethod'];
function validate(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('local.json必须是配置对象');
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new Error('local.json含未支持字段，请勿存储令牌或密码');
  if (typeof value.enabled !== 'boolean') throw new Error('enabled必须是布尔值');
  const result = { enabled: value.enabled };
  if (value.version !== undefined) {
    if (typeof value.version !== 'string' || !/^v?\d+\.\d+\.\d+(?:[-.\w]*)$/.test(value.version)) throw new Error('version格式无效');
    result.version = value.version;
  }
  for (const key of ['baseUrl', 'imageBaseUrl']) {
    if (value[key] === undefined) continue;
    if (typeof value[key] !== 'string') throw new Error(`${key}必须是URL字符串`);
    const url = new URL(value[key]);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error(`${key}须为不含凭据、查询串和锚点的HTTP(S)地址`);
    if (key === 'baseUrl' && !url.pathname.replace(/\/$/, '').endsWith('/api')) throw new Error('baseUrl须以/api结尾');
    result[key] = value[key].replace(/\/$/, '');
  }
  if (value.paymentMethod !== undefined) {
    if (!['test', 'wechat'].includes(value.paymentMethod)) throw new Error('paymentMethod只支持test/wechat');
    result.paymentMethod = value.paymentMethod;
  }
  return result;
}
function configure({ root = defaultRoot, production = false, init = false } = {}) {
  const dir = path.join(root, 'config');
  fs.mkdirSync(dir, { recursive: true });
  const localFile = path.join(dir, 'local.json');
  if (init && !fs.existsSync(localFile)) fs.copyFileSync(path.join(defaultRoot, 'config/local.example.json'), localFile);
  let local = { enabled: false };
  if (!production) {
    if (!fs.existsSync(localFile)) throw new Error('缺少config/local.json；先运行node scripts/configure-runtime.js --init，或使用--production');
    local = validate(JSON.parse(fs.readFileSync(localFile, 'utf8').replace(/^\uFEFF/, '')));
  }
  const target = path.join(dir, 'runtime.generated.js');
  const temporary = `${target}.tmp`;
  fs.writeFileSync(temporary, '// 自动生成；不提交。修改local.json后重新运行configure-runtime。\nmodule.exports = ' + JSON.stringify(local, null, 2) + ';\n');
  fs.renameSync(temporary, target);
  return { enabled: local.enabled, production };
}
if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    if (args.some(arg => !['--production', '--init'].includes(arg))) throw new Error('支持参数：--production、--init；无参数读取已有local.json');
    const result = configure({ production: args.includes('--production'), init: args.includes('--init') });
    console.log(result.enabled ? '已生成个人联调覆盖；仅 develop 使用，trial/release 仍按微信环境选择。' : '已关闭个人联调覆盖；trial 使用 trial.js，release 使用 production.js。');
  } catch (error) { console.error('配置生成失败：' + error.message); process.exitCode = 1; }
}
module.exports = { configure, validate };
