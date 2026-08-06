// utils/log.js
const rtLog = wx.getRealtimeLogManager ? wx.getRealtimeLogManager() : null;

module.exports = {
  info(...args) {
    rtLog && rtLog.info.apply(rtLog, args);
  },
  warn(...args) {
    rtLog && rtLog.warn.apply(rtLog, args);
  },
  error(...args) {
    rtLog && rtLog.error.apply(rtLog, args);
  }
};