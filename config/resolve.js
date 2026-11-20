const production = require('./production');
const trial = require('./trial');
/**
 * 修改日期：2026-11-12。根据微信运行环境自动选地址，不由后端 NODE_ENV 决定。
 * develop：enabled=true 时使用 local.json 生成的 runtime.generated.js；否则正式默认。
 * trial：使用 trial.js，连接测试服务器。
 * release、未知或识别失败：使用 production.js，连接生产服务器。
 * 同一个代码包上传为体验版、再正式发布时，无需手工替换地址。
 */
module.exports = function resolveConfig(wxApi, local) {
  let environment = '';
  try { environment = wxApi.getAccountInfoSync().miniProgram.envVersion; }
  catch (_) { /* 无法确认开发版时沿用正式默认。 */ }
  if (environment === 'trial') return { ...trial };
  if (environment !== 'develop' || !local || local.enabled !== true) return { ...production };
  const result = { ...production };
  for (const key of Object.keys(production)) {
    if (Object.prototype.hasOwnProperty.call(local, key)) result[key] = local[key];
  }
  return result;
};
