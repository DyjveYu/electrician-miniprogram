const orderEntry = require('./orderEntry');
let pending = null;
const certLabels = { low_voltage: '低压电工', high_voltage: '高压电工', construction: '建筑电工' };
function isExplicit(order) {
  return ['personal_quick', 'enterprise_quick'].includes(order?.order_type) && (order.service_mode != null || order.required_cert_type != null);
}
function labels(order) {
  return {
    isExplicitSingle: isExplicit(order),
    isNewEnterprise: order.order_type === 'enterprise_quick' && isExplicit(order),
    serviceModeName: ({ on_site: '上门服务', off_site: '不上门服务' })[order.service_mode] || '未记录',
    requiredCertName: certLabels[order.required_cert_type] || '未记录',
    electricityTypeName: ({ residential: '居民用电', industrial: '工商业用电' })[order.electricity_type] || '未记录'
  };
}
// 只由主动确认事件写入，不能靠 URL 参数恢复同意；跨账号或消费后失效。
function grant(app, id) { pending = { key: orderEntry.key(app), id: String(id) }; }
function consume(app, id) {
  const value = pending;
  pending = null;
  return !!value?.key && value.key === orderEntry.key(app) && value.id === String(id);
}
function clear() { pending = null; }
module.exports = { isExplicit, labels, grant, consume, clear };
