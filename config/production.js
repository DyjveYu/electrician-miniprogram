/**
 * 正式默认配置。修改日期：2026-11-12（补充环境说明，配置值保持原样）。
 * 微信 release 及环境识别失败时读取；develop 未启用本地覆盖时也使用这些默认值。
 * 体验版地址在 trial.js；本地联调地址在 local.json，不再编辑 app.js/app.json。
 */
module.exports = {
  version: 'v1.1.6',
  baseUrl: 'https://api.51zoon.com/api',
  imageBaseUrl: 'https://api.51zoon.com',
  paymentMethod: 'wechat'
};
