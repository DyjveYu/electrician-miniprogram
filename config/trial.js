/**
 * 体验版配置。修改日期：2026-11-12。
 * 微信 envVersion=trial 时读取本文件，连接测试服务器；不读取个人 local.json。
 * 体验版连接测试服并使用模拟支付，正式版继续读取 production.js。
 */
const production = require('./production');
module.exports = {
  ...production,
  paymentMethod: 'test',
  baseUrl: 'https://api.mijutime.com/api', // 测试 API 地址，必须包含 /api。
  imageBaseUrl: 'https://api.mijutime.com' // 测试图片及下载地址，不包含 /api。
};
