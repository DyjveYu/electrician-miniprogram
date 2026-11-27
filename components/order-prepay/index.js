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
    projectPrice: { type: Object, value: null },
    enterpriseOnsite: { type: Boolean, value: false },
    sharedLayout: { type: Boolean, value: false },
    offsite: { type: Boolean, value: false }
  },
  data: { mode: 'fixed_deposit', price: '', paragraphs, opened: false, agreed: false, reading: false, confirming: false },
  methods: {
    noop() {},
    chooseMode(e) { if (!this.data.confirming) this.setData({ mode: e.detail.value, agreed: false }); },
    inputPrice(e) { this.setData({ price: e.detail.value, agreed: false }); },
    inputSharedPrice(e) {
      if (this.data.confirming) return;
      const price = e.detail.value.trim();
      this.setData({ price, mode: price ? 'fixed_price' : 'fixed_deposit' });
    },
    read() { this.setData({ reading: true, opened: !this.data.enterpriseOnsite || this.data.opened }); },
    closeReader() { this.setData({ reading: false }); },
    acceptReader() {
      if (this.data.enterpriseOnsite && this.data.reading && !this.data.confirming) {
        this.setData({ reading: false, agreed: true });
      }
    },
    changeAgreement(e) { this.setData({ agreed: e.detail.value.includes('agree') }); },
    close() { if (!this.data.confirming) this.triggerEvent('close'); },
    closeFromBackdrop() {
      if (this.data.sharedLayout && !this.data.reading) this.close();
    },
    async confirm() {
      const requiresOpened = !this.data.enterpriseOnsite && !this.data.sharedLayout;
      if ((requiresOpened && !this.data.opened) || !this.data.agreed || this.data.confirming || this.data.reading) return;
      this.setData({ confirming: true });
      const project = this.data.project, contract = this.data.projectPrice;
      const selectable = project && contract?.priceRevision != null;
      if (!this.data.offsite || (project && !selectable)) { this.triggerEvent('confirm'); return; }
      const mode = this.data.mode, amount = mode === 'fixed_price' ? this.data.price : (project ? String(contract.deposit) : '200.00');
      try {
        if (amount.length > 12 || !/^\d+(\.\d{1,2})?$/.test(amount) || Number(amount) < 0.01 || Number(amount) > 99999999.99) throw new Error('请输入0.01至99,999,999.99元，最多两位小数');
        const route = project ? 'project-billing/price' : 'offsite/price';
        const result = await require('../../utils/offsiteOrder').request('POST', `/orders/${this.data.orderId}/${route}`, {
          pricing_mode: mode, amount, prepay_agreed: true, ...(project && {price_revision:contract.priceRevision})
        });
        if (project && (!Number.isInteger(result.data?.price_revision) || result.data?.pricing_mode !== mode || Number(result.data?.amount) !== Number(amount))) {
          throw new Error('工程价格未确认，请重新打开原单');
        }
        this.triggerEvent('confirm', { mode, amount, ...(project && { priceRevision:result.data.price_revision }) });
      } catch (error) {
        this.setData({ confirming: false });
        if (!error.stale) wx.showModal({ title: '无法确认金额', content: error.message || '请从原单核对', showCancel: false });
      }
    }
  }
});
