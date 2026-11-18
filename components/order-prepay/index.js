const paragraphs = require('../../config/prepay-agreement');
Component({
  properties: {
    visible: { type: Boolean, value: false, observer(value) {
      if (value) this.setData({ mode: this.data.pricingMode || 'fixed_deposit', price: this.data.pricingMode === 'fixed_price' ? this.data.amount : '', opened: false, agreed: false, reading: false, confirming: false });
    } },
    pricingMode: { type: String, value: 'fixed_deposit' },
    amount: { type: String, value: '0.00' },
    orderId: { type: Number, value: 0 },
    project: { type: Boolean, value: false },
    offsite: { type: Boolean, value: false }
  },
  data: { mode: 'fixed_deposit', price: '', paragraphs, opened: false, agreed: false, reading: false, confirming: false },
  methods: {
    noop() {},
    chooseMode(e) { if (!this.data.confirming) this.setData({ mode: e.detail.value, agreed: false }); },
    inputPrice(e) { this.setData({ price: e.detail.value, agreed: false }); },
    read() { this.setData({ reading: true, opened: true }); },
    closeReader() { this.setData({ reading: false }); },
    changeAgreement(e) { this.setData({ agreed: e.detail.value.includes('agree') }); },
    close() { if (!this.data.confirming) this.triggerEvent('close'); },
    async confirm() {
      if (!this.data.opened || !this.data.agreed || this.data.confirming) return;
      this.setData({ confirming: true });
      if (!this.data.offsite || this.data.project) { this.triggerEvent('confirm'); return; }
      const mode = this.data.mode, amount = mode === 'fixed_price' ? this.data.price : '200.00';
      try {
        if (amount.length > 12 || !/^\d+(\.\d{1,2})?$/.test(amount) || Number(amount) < 0.01 || Number(amount) > 99999999.99) throw new Error('请输入0.01至99,999,999.99元，最多两位小数');
        await require('../../utils/offsiteOrder').request('POST', `/orders/${this.data.orderId}/offsite/price`, { pricing_mode: mode, amount, prepay_agreed: true });
        this.triggerEvent('confirm', { mode, amount });
      } catch (error) {
        this.setData({ confirming: false });
        if (!error.stale) wx.showModal({ title: '无法确认金额', content: error.message || '请从原单核对', showCancel: false });
      }
    }
  }
});
