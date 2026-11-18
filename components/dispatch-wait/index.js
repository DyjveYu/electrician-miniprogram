const flow = require('../../utils/offsiteOrder');
const entry = require('../../utils/orderEntry');
const { formatTime } = require('../../utils/util');

Component({
  properties:{
    order:{type:Object,observer(order) {
      const value = order?.dispatch_wait;
      const labels = {pending:'待发起原路退款',processing:'退款处理中',unknown:'退款结果待核对',failed:'退款未完成，请联系客服',success:'已原路退回'};
      const reasons = {expiring:'等待接单已到期，系统正在处理',timeout:'满24小时无人接单，系统已取消',cancelled:'订单已取消',payment_review:'订单已到期，原付款待平台核对',project_ended:'工程已到期，请联系客服'};
      this.setData({deadline:value?.expiresAt ? formatTime(value.expiresAt) : '', refundLabel:labels[value?.refundState] || '',
        reasonLabel:reasons[value?.finishedReason] || ''});
    }}
  },
  data:{busy:false,deadline:'',refundLabel:'',reasonLabel:''},
  methods:{
    noop() {},
    async choose(e) {
      const order = this.data.order;
      const stage = order?.dispatch_wait?.choiceStage;
      if (this.data.busy || !stage) return;
      const action = e.currentTarget.dataset.action, account = entry.key(getApp());
      this.setData({busy:true});
      try {
        if (action === 'cancel') {
          const modal = await wx.showModal({title:'取消订单',content:`确认取消并退回原实付 ¥${order.dispatch_wait.amount}？`});
          if (!modal.confirm) return;
        }
        if (account !== entry.key(getApp())) return;
        await flow.request('POST',`/orders/${order.id}/dispatch-wait`,{action,stage});
        this.triggerEvent('refresh');
      } catch (error) {
        if (!error.stale) {
          wx.showToast({title:error.message || '订单状态已变化，请刷新',icon:'none'});
          this.triggerEvent('refresh');
        }
      } finally { this.setData({busy:false}); }
    }
  }
});
