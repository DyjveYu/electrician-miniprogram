// pages/address/edit/edit.js
Page({
  data: {
    addressId: '',
    formData: {
      contactName: '',
      contactPhone: '',
      province: '',
      city: '',
      district: '',
      detail: '',
      regionValue: ['', '', ''], // 用于 picker 的值
      isDefault: false
    },
    saving: false,
    isEdit: false
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ addressId: options.id, isEdit: true });
      this.loadAddressDetail();
    }
  },

  // 加载地址详情
  loadAddressDetail() {
    const app = getApp();
    wx.request({
      url: `${app.globalData.baseUrl}/addresses/${this.data.addressId}`,
      method: 'GET',
      header: {
        'Authorization': `Bearer ${app.globalData.token}`
      },
      success: (res) => {
        if (res.data.code === 0) {
          this.setData({ formData: res.data.data });
        }
      }
    });
  },

  // 输入联系人
  onContactNameInput(e) {
    this.setData({ 'formData.contactName': e.detail.value });
  },

  // 输入电话
  onContactPhoneInput(e) {
    this.setData({ 'formData.contactPhone': e.detail.value });
  },

  // 选择地区 10.28 新增
  onRegionChange(e) {
    const [province, city, district] = e.detail.value;
    this.setData({
      'formData.province': province,
      'formData.city': city,
      'formData.district': district,
      regionValue: e.detail.value
    });
  },
  // 选择地区 旧的方法。
  chooseRegion() {
    const that = this;
    wx.chooseLocation({
      success(res) {
        that.setData({
          'formData.province': res.address.split(' ')[0] || '',
          'formData.city': res.address.split(' ')[1] || '',
          'formData.district': res.address.split(' ')[2] || '',
          'formData.detail': res.name
        });
      }
    });
  },

  // 输入详细地址
  onDetailInput(e) {
    this.setData({ 'formData.detail': e.detail.value });
  },

  // 切换默认地址
  toggleDefault() {
    this.setData({ 'formData.isDefault': !this.data.formData.isDefault });
  },

  // 保存地址
  saveAddress() {
    if (!this.validateForm()) return;
    if (this.data.saving) return;

    this.setData({ saving: true });

    const app = getApp();
    const url = this.data.isEdit
      ? `${app.globalData.baseUrl}/addresses/${this.data.addressId}`
      : `${app.globalData.baseUrl}/addresses`;
    const method = this.data.isEdit ? 'PUT' : 'POST';

    console.log('提交地址前的数据:', this.data.formData);
    // ① 从 formData 中排除 regionValue 字段
    const { regionValue, ...formData } = this.data.formData;
    // ② 打印确认实际提交的数据
    console.log('实际提交到后端的数据:', formData);
    // ③ 调用接口
    wx.request({
      url,
      method,
      header: {
        'Authorization': `Bearer ${app.globalData.token}`
      },

      data: formData,
      success: (res) => {
        this.setData({ saving: false });
        if (res.data.code === 0 || res.data.code === 200) {
          wx.showToast({ title: '保存成功！', icon: 'none', duration: 1500 });
          setTimeout(() => {
            const pages = getCurrentPages();
            if (pages.length > 1) {
              wx.navigateBack();
            } else {
              wx.redirectTo({ url: '/pages/address/list/list' });
            }
          }, 1500);
        } else {
          wx.showToast({ title: res.data.message || '保存失败', icon: 'none' });
        }
      },
      fail: () => {
        this.setData({ saving: false });
        wx.showToast({ title: '网络错误', icon: 'none' });
      }
    });
  },

  // 表单验证
  validateForm() {
    const { contactName, contactPhone, detail } = this.data.formData;

    if (!contactName.trim()) {
      wx.showToast({ title: '请输入联系人', icon: 'none' });
      return false;
    }

    if (!contactPhone.trim()) {
      wx.showToast({ title: '请输入联系电话', icon: 'none' });
      return false;
    }

    const phoneReg = /^1[3-9]\d{9}$/;
    if (!phoneReg.test(contactPhone)) {
      wx.showToast({ title: '请输入正确的手机号', icon: 'none' });
      return false;
    }

    if (!detail.trim()) {
      wx.showToast({ title: '请输入详细地址', icon: 'none' });
      return false;
    }

    return true;
  }
});