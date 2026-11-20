/**
 * 体验版配置。修改日期：2026-11-12。
 * 微信 envVersion=trial 时读取本文件，连接测试服务器；不读取个人 local.json。
 * 这里只切换地址，支付方式及其他默认值沿用 production.js，不代表已关闭真实支付。
 */
const production = require('./production');
module.exports = {
  ...production,
  baseUrl: 'https://api.mijutime.com/api', // 测试 API 地址，必须包含 /api。
  imageBaseUrl: 'https://api.mijutime.com' // 测试图片及下载地址，不包含 /api。
};
