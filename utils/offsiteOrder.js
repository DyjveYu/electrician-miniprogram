const entry = require('./orderEntry');
const refundLabels = { not_due: '工费支付后退押金', pending: '待发起原路退款', processing: '退款处理中', success: '押金已原路退回', failed: '退款失败，请平台核对', unknown: '退款结果待核对' };
async function request(method, url, data = {}) {
  const { API } = require('./api');
  const app = getApp(), key = entry.key(app), token = app.globalData.token, version = app._orderSessionVersion || 0;
  const current = () => key && key === entry.key(app) && token === app.globalData.token && version === (app._orderSessionVersion || 0);
  let result;
  try { result = await API.request({ method, url, data, showError: false, preserveSession: true }); }
  catch (error) { if (!current()) throw Object.assign(new Error('登录状态已变化，请重新进入'), { stale: true }); throw error; }
  if (!current()) throw Object.assign(new Error('登录状态已变化，请重新进入'), { stale: true });
  return result;
}
function labels(order) {
  const f = order.offsite_finance;
  return { isOffsite: order.service_mode === 'off_site' || order.pricing_mode != null,
    offsiteStatusName: require('./util').getDisplayStatusText(order),
    offsiteFeeName: f?.feeAmount > 0 ? Number(f.feeAmount).toFixed(2) : '待双方确认',
    offsiteRefundName: refundLabels[f?.refundState] || '待核对',
    offsiteSettlementName: ({ not_due: '尚未进入结算', waiting_review: '等待评价', waiting_refund: '等待押金原路退回', waiting_time: '等待五星后24小时', ready: '已满足结算条件，提现以收入页余额为准', unsettled: '已完成不结算', needs_review: '资金状态需平台核对' })[f?.settlementStage] || '待核对',
    offsiteElectricianName: f?.feeAmount > 0 ? Number(f.electricianAmount).toFixed(2) : '待确认' };
}
module.exports = { request, labels, refundLabels };
