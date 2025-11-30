Component({
  properties: {
    type: {
      type: String,
      value: 'primary'
    },
    size: {
      type: String,
      value: 'medium'
    },
    plain: {
      type: Boolean,
      value: false
    },
    disabled: {
      type: Boolean,
      value: false
    },
    customStyle: {
      type: String,
      value: ''
    }
  },
  methods: {
    onClick() {
      if (this.data.disabled) return;
      this.triggerEvent('click');
    }
  }
})