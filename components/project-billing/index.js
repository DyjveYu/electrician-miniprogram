const {request} = require('../../utils/offsiteOrder');
const entry = require('../../utils/orderEntry');
Component({
  properties:{order:Object,role:String},
  data:{note:'',amount:'',images:[],busy:false},
  methods:{
    edit(e) { this.setData({[e.currentTarget.dataset.key]:e.detail.value}); },
    async proof() {
      if (this.data.busy) return;
      const key=entry.key(getApp());
      try {
        this.setData({busy:true});
        const selected=await wx.chooseImage({count:1});
        const response=await require('../../utils/api').API.uploadFile(selected.tempFilePaths[0],{showError:false});
        if (key===entry.key(getApp()) && response.data?.url) this.setData({images:[...this.data.images,response.data.url].slice(0,9)});
      } catch(error) { wx.showToast({title:'凭证未上传',icon:'none'}); }
      finally { this.setData({busy:false}); }
    },
    async submit(e) {
      if (this.data.busy) return;
      const action=e.currentTarget.dataset.action, id=this.data.order.id, key=entry.key(getApp());
      this.setData({busy:true});
      try {
        const body=action==='deliver'?{note:this.data.note,images:this.data.images}:action==='fee'?{amount:this.data.amount}:action==='close-payment'?{type:e.currentTarget.dataset.type}:{};
        const result=await wx.showModal({title:'确认操作',content:action==='deliver'?'提交本人的交付说明和凭证？':action==='fee'?'确认整单工费 '+body.amount+' 元并前往付款？':action==='close-payment'?'查询并关闭原未付款交易？':'取消工程并按原支付核对押金退款？'});
        if (!result.confirm || key!==entry.key(getApp())) return;
        await request('POST','/orders/'+id+'/project-billing/'+action,body);
        if (action==='fee') wx.navigateTo({url:'/pages/payment/payment/payment?orderId='+id+'&type=repair'});
        else this.triggerEvent('refresh');
      } catch(error) { wx.showToast({title:error.message || '操作未完成',icon:'none'}); }
      finally { this.setData({busy:false}); }
    }
  }
});
