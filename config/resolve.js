const production = require('./production');
module.exports = function resolveConfig(wxApi, local) {
  let environment = '';
  try { environment = wxApi.getAccountInfoSync().miniProgram.envVersion; }
  catch (_) { /* 无法确认开发版时沿用正式默认。 */ }
  if (environment !== 'develop' || !local || local.enabled !== true) return { ...production };
  const result = { ...production };
  for (const key of Object.keys(production)) {
    if (Object.prototype.hasOwnProperty.call(local, key)) result[key] = local[key];
  }
  return result;
};
