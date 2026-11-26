const { formatTime } = require('../../utils/util');

Component({
  properties:{
    detailCard: { type: Boolean, value: false },
    order:{type:Object,observer(order) {
      const value = order?.dispatch_wait;
      const labels = {pending:'待发起原路退款',processing:'退款处理中',unknown:'退款结果待核对',failed:'退款未完成，请联系客服',success:'已原路退回'};
      const reasons = {expiring:'等待接单已到期，系统正在处理',timeout:'满24小时无人接单，系统已取消',cancelled:'订单已取消',payment_review:'订单已到期，原付款待平台核对',project_ended:'工程已到期，请联系客服'};
      this.setData({deadline:value?.expiresAt ? formatTime(value.expiresAt) : '', refundLabel:labels[value?.refundState] || '',
        reasonLabel:reasons[value?.finishedReason] || ''});
    }}
  },
  data:{deadline:'',refundLabel:'',reasonLabel:''}
});
