// 仅保留本次登录后的内存意图，不保存凭据，不恢复旧会话草稿。
let serial = 0;
let pending = null;
function key(app) {
  const user = app.globalData.userInfo;
  return user && user.id && app.globalData.token ? `${user.id}:${user.current_role}:${app._orderSessionVersion || 0}` : null;
}
function begin(app) {
  const user = app.globalData.userInfo;
  if (!user || !['user', 'enterprise'].includes(user.current_role) || !key(app)) return null;
  pending = { id: String(++serial), key: key(app) };
  return pending.id;
}
function valid(app, id) { return !!pending && pending.key === key(app) && (id === undefined || pending.id === String(id)); }
function consume(app, id) {
  if (!valid(app, id)) return false;
  pending = null;
  return true;
}
function clear() { pending = null; }
module.exports = { key, begin, valid, consume, clear };
