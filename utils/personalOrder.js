const orderEntry = require('./orderEntry');
let pending = null;
function isExplicit(order) {
  return ['personal_quick', 'enterprise_quick', 'enterprise_project'].includes(order?.order_type) && (order.service_mode != null || order.required_cert_type != null);
}
function labels(order) {
  return {
    isExplicitSingle: isExplicit(order),
    isNewEnterprise: ['enterprise_quick', 'enterprise_project'].includes(order.order_type) && isExplicit(order),
    isNewProject: order.order_type === 'enterprise_project' && isExplicit(order),
    projectStartDateName: projectDate(order.proj_start_time || order.projStartTime),
    projectEndDateName: projectDate(order.proj_end_time || order.projEndTime),
    serviceModeName: ({ on_site: '上门服务', off_site: '不上门服务' })[order.service_mode] || '未记录',
    requiredCertName: require('./orderCertificateOptions').label(order.required_cert_type, ['enterprise_quick', 'enterprise_project'].includes(order.order_type)),
    electricityTypeName: ({ residential: '居民用电', industrial: '工商业用电' })[order.electricity_type] || '未记录'
  };
}
function projectDate(value) {
  if (!value) return '未记录';
  const parsed = new Date(value);
  if (/[TZ]|[+-]\d{2}:?\d{2}$/.test(String(value)) && !Number.isFinite(parsed.getTime())) return '未记录';
  const date = typeof value === 'string' && !/[TZ]|[+-]\d{2}:?\d{2}$/.test(value)
    ? value.slice(0, 10) : new Date(new Date(value).getTime() + 8 * 3600000).toISOString().slice(0, 10);
  return require('./projectOrder').label(date) || '未记录';
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
