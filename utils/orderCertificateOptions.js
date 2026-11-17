const types = ['low_voltage', 'high_voltage', 'construction'];
const names = { low_voltage: '低压电工', high_voltage: '高压电工', construction: '建筑电工' };
function serialize(values) {
  if (!Array.isArray(values) || !values.length || values.some(v => !types.includes(v))) return '';
  return types.filter(v => values.includes(v)).join(',');
}
function parse(value, multiple = false) {
  if (typeof value !== 'string' || !value) return [];
  const values = value.split(',');
  return (multiple || values.length === 1) && serialize(values) === value ? values : [];
}
function label(value, multiple = false) { return parse(value, multiple).map(v => names[v]).join(' / ') || '未记录'; }
module.exports = { types, serialize, parse, label };
