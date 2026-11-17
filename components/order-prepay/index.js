const paragraphs = require('../../config/prepay-agreement');
Component({
  properties: {
    visible: { type: Boolean, value: false, observer(value) {
      if (value) this.setData({ opened: false, agreed: false, reading: false, confirming: false });
    } },
    amount: { type: String, value: '0.00' }
  },
  data: { paragraphs, opened: false, agreed: false, reading: false, confirming: false },
  methods: {
    noop() {},
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
