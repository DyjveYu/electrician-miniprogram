function today(now = new Date()) { return new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 10); }
function valid(value) { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value; }
function days(start, end) { return valid(start) && valid(end) ? (Date.parse(end) - Date.parse(start)) / 86400000 + 1 : 0; }
function allowed(start, end, now = new Date()) { const count = days(start, end); return valid(start) && start >= today(now) && count >= 2 && count <= 29; }
function label(value) { return valid(value) ? value.replace('-', '年').replace('-', '月') + '日' : ''; }
function money(value) { return /^\d{1,8}(\.\d{1,2})?$/.test(String(value)) && Number(value) > 0 && Number.isFinite(Number(value)); }
module.exports = { today, days, allowed, label, money };
