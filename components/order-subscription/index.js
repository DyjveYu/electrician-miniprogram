const subscription = require('../../utils/orderSubscription');
Component({
  properties: { orderId: { type: Number, value: 0, observer() {
    if (this._subscriptionAttached) this.reloadSubscription();
  } } },
  data: { orderSubscriptionType: 'accepted', orderSubscriptionEnabled: false, orderSubscriptionTemplate: '', orderSubscriptionBusy: false },
  lifetimes: {
    attached() { this._subscriptionAttached = true; this._subscriptionVisible = true; this.reloadSubscription(); },
    detached() { this._subscriptionAttached = false; subscription.hide(this); }
  },
  pageLifetimes: {
    show() { this._subscriptionVisible = true; this.reloadSubscription(); },
    hide() { subscription.hide(this); }
  },
  methods: {
    reloadSubscription() {
      subscription.hide(this); this._subscriptionVisible = true;
      this.setData({ orderSubscriptionEnabled: false });
      if (this.data.orderId > 0) subscription.load(this);
    },
    subscribe() { subscription.subscribe(this); }
  }
});
