const messages = {
  ORDER_QUALIFICATION_MISMATCH: '该订单所需资质与您当前有效证书不匹配，请返回首页刷新订单',
  ORDER_OUTSIDE_BASE_REGION: '该订单不在您当前的接单区域，请返回首页刷新订单',
  ORDER_REGION_UNAVAILABLE: '接单区域或订单服务地址信息不完整，暂无法接单，请刷新后重试或联系客服'
};

function regionError(response) {
  const reason = response && response.data && response.data.data && response.data.data.reason;
  return Object.prototype.hasOwnProperty.call(messages, reason) ? messages[reason] : '';
}

function isTakeSuccess(response) {
  if (!response || regionError(response)) return false;
  const status = response.statusCode;
  if (status !== undefined && !(status >= 200 && status < 300)) return false;
  const body = response.data || {};
  if (body.success === false) return false;
  if (body.code !== undefined) return body.code === 0 || body.code === 200;
  return body.success === true;
}

module.exports = { regionError, isTakeSuccess };
