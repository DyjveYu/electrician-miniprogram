const paragraphs = require('../../config/prepay-agreement');
Component({
  properties: {
    visible: { type: Boolean, value: false, observer(value) {
      if (value) this.setData({ opened: false, agreed: false, reading: false, confirming: false });
    } },
    amount: { type: String, value: '0.00' },
    orderId: { type: Number, value: 0 },
    project: { type: Boolean, value: false },
    offsite: { type: Boolean, value: false }
  },
  data: { paragraphs, opened: false, agreed: false, reading: false, confirming: false },
  methods: {
    noop() {},
    onePriceUnavailable() { wx.showToast({ title: '一口价暂未开放', icon: 'none' }); },
    read() { this.setData({ reading: true, opened: true }); },
    closeReader() { this.setData({ reading: false }); },
    changeAgreement(e) { this.setData({ agreed: e.detail.value.includes('agree') }); },
    close() { if (!this.data.confirming) this.triggerEvent('close'); },
    confirm() {
      if (!this.data.opened || !this.data.agreed || this.data.confirming) return;
      this.setData({ confirming: true });
      this.triggerEvent('confirm');
    }
  }
});
