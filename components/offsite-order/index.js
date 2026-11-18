const flow = require('../../utils/offsiteOrder');
const entry = require('../../utils/orderEntry');
const personal = require('../../utils/personalOrder');
Component({
  properties: { order: { type: Object, value: null }, role: { type: String, value: '' } },
  data: { busy: false, amount: '', content: '', images: [], rating: 5, comment: '', ratingOptions: ['1星', '2星', '3星', '4星', '5星'] },
  lifetimes: { attached() { this._active = true; this._generation = 0; }, detached() { this._active = false; this._generation = (this._generation || 0) + 1; } },
  pageLifetimes: { show() { this._active = true; this.setData({ busy: false }); }, hide() { this._active = false; this._generation = (this._generation || 0) + 1; } },
  methods: {
    inputAmount(e) { this.setData({ amount: e.detail.value }); },
    inputContent(e) { this.setData({ content: e.detail.value }); },
    inputComment(e) { this.setData({ comment: e.detail.value }); },
    inputRating(e) { this.setData({ rating: Number(e.detail.value) + 1 }); },
    call(e) { const phone = e.currentTarget.dataset.phone; if (phone) wx.makePhoneCall({ phoneNumber: phone }); },
    previewImage(e) {
      const { src, urls } = e.currentTarget.dataset;
      if (src && Array.isArray(urls) && urls.length) wx.previewImage({ current: src, urls });
    },
    async run(fn) {
      if (this.data.busy || !this.data.order?.id || this._active === false) return;
      const app = getApp(), key = entry.key(app), token = app.globalData.token, generation = this._generation;
      const current = () => this._active !== false && generation === this._generation && key && key === entry.key(app) && token === app.globalData.token;
      this.setData({ busy: true });
      try { await fn(current); if (current()) this.triggerEvent('refresh'); }
      catch (error) { if (current() && !error.stale) wx.showModal({ title: '暂未完成', content: error.message || '请刷新核对原订单', showCancel: false, confirmColor: '#16835c' }); }
      finally { if (current()) this.setData({ busy: false }); }
    },
    confirm(text) {
      const app = getApp(), key = entry.key(app), generation = this._generation;
      return new Promise(resolve => wx.showModal({ title: '请确认', content: text, confirmColor: '#16835c', success: result => resolve(!!result.confirm && this._active !== false && generation === this._generation && key === entry.key(app)), fail: () => resolve(false) }));
    },
    take() { return this.run(async () => { if (await this.confirm(this.data.order.isFixedPrice ? '确认按约定的一口价接取此订单？' : '确认接取此不上门订单？工费由双方确认，200元订单押金不属于电工收入。')) await flow.request('POST', `/orders/${this.data.order.id}/take`); }); },
    start() { return this.run(() => flow.request('PUT', `/orders/${this.data.order.id}/start`)); },
    delivery() { return this.run(async () => {
      if (await this.confirm('确认电工已按约完成服务并进入评价？')) await flow.request('POST', `/orders/${this.data.order.id}/offsite/confirm-delivery`);
    }); },
    quote() { return this.run(async () => {
      if (this.data.order.isFixedPrice) {
        if (!this.data.content.trim()) throw new Error('请填写完成说明');
        if (await this.confirm('提交交付内容供下单人确认？')) await flow.request('POST', `/orders/${this.data.order.id}/offsite/quote`, { repair_content: this.data.content.trim(), repair_images: this.data.images });
        return;
      }
      if (!/^\d+(\.\d{1,2})?$/.test(this.data.amount) || Number(this.data.amount) < .01 || Number(this.data.amount) > 99999999.99) throw new Error('工费为0.01至99,999,999.99元，最多两位小数');
      if (!this.data.content.trim()) throw new Error('请填写已经完成的服务内容');
      if (await this.confirm(`已完成服务，提交工费${this.data.amount}元（含15%平台费），等待用户另行支付？`)) {
        await flow.request('POST', `/orders/${this.data.order.id}/offsite/quote`, { amount: this.data.amount, repair_content: this.data.content, repair_images: this.data.images });
      }
    }); },
    payDeposit() { if (this._active === false || this.data.busy) return; personal.clear(); wx.navigateTo({ url: `/pages/payment/payment/payment?orderId=${this.data.order.id}&type=prepay` }); },
    removeImage(e) { if (!this.data.busy) this.setData({ images: this.data.images.filter((_, index) => index !== Number(e.currentTarget.dataset.index)) }); },
    payFee() { return this.run(async current => {
      const order = this.data.order, revision = order.offsite_finance?.feeRevision;
      if (!await this.confirm(`确认服务内容和工费${order.offsiteFeeName}元（含15%平台费）？工费另付，200元押金随后全额退回。`)) return;
      await flow.request('POST', `/orders/${order.id}/offsite/confirm-fee`, { fee_revision: revision });
      if (current()) wx.navigateTo({ url: `/pages/payment/payment/payment?orderId=${order.id}&type=repair` });
    }); },
    closeFee() { return this.run(async () => {
      if (await this.confirm('查询并关闭原支付，仅在确认未付款后允许重新选择金额。')) await flow.request('POST', `/orders/${this.data.order.id}/offsite/close-fee`);
    }); },
    refreshFunds() { return this.run(async current => {
      if (this.data.role === 'user') await flow.request('POST', `/orders/${this.data.order.id}/offsite/check-payments`);
      if (current()) await flow.request('POST', `/orders/${this.data.order.id}/offsite/refund`);
    }); },
    cancel() { return this.run(async () => {
      if (await this.confirm('取消未接单订单？已实付款项将办理全额原路退款，到账结果另行确认。')) await flow.request('PUT', `/orders/${this.data.order.id}/cancel`, { cancel_reason: '用户取消不上门订单' });
    }); },
    review() { return this.run(() => flow.request('PUT', `/orders/${this.data.order.id}/review`, { rating: this.data.rating, comment: this.data.comment, ...(this.data.order.isFixedPrice && { expected_review_status: this.data.order.status }) })); },
    chooseImages() {
      if (this.data.busy || this.data.images.length >= 9) return;
      wx.chooseImage({ count: 9 - this.data.images.length, success: result => this.run(async current => {
        const { API } = require('../../utils/api');
        const app = getApp(), key = entry.key(app), urls = [];
        for (const path of result.tempFilePaths) {
          const response = await API.uploadFile(path, { showError: false });
          if (!current() || key !== entry.key(app)) return;
          const url = response.data?.url || response.url;
          if (!url) throw new Error('图片上传未确认，请重新选择');
          urls.push(url);
        }
        this.setData({ images: [...this.data.images, ...urls] });
      }) });
    }
  }
});
