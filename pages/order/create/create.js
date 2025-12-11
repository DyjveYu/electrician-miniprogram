// pages/order/create/create.js
const DEFAULT_SERVICE_TYPES = [
  { id: 1, name: '电路维修', icon: '🔌' },
  { id: 2, name: '开关插座', icon: '🔘' },
  { id: 3, name: '灯具安装', icon: '💡' },
  { id: 4, name: '其他电工服务', icon: '⚡' }
];

Page({
  data: {
    serviceTypes: [],              // 从后端或回退到默认值
    selectedServiceTypeId: null,   // 用于模板判断样式（避免复杂表达式）
    selectedServiceType: null,     // 提交时用的完整对象
    description: '',
    images: [],
    // 联系人信息不再由用户填写，将取自地址选择
    contactName: '',
    contactPhone: '',
    // 地址与时间选择
    showAddressSheet: false,
    loadingAddresses: false,
    addresses: [],
    selectedAddress: null,
    selectedAddressStr: '',
    latitude: '',
    longitude: '',
    showTimeSheet: false,
    dateList: [],
    timeSlots: ['08:00-09:00','09:00-10:00','10:00-11:00','11:00-12:00','13:00-14:00','14:00-15:00','15:00-16:00','16:00-17:00','17:00-18:00','19:00-20:00','20:00-21:00','21:00-22:00'],
    selectedDateIndex: 0,
    selectedSlot: '',
    expectedTimeStr: '',
    expectedTimeIso: '',
    // 预付金额（默认30.00，如服务类型有配置则覆盖；测试阶段0.01）
    prepayAmount: '0.01',
    canSubmit: false,
    submitting: false
  },

  onLoad() {
    // 兜底检查：验证登录状态
    const app = getApp();
    if (!app.globalData.token || !app.globalData.userInfo) {
      wx.showToast({
        title: '请先登录',
        icon: 'none',
        duration: 1500
      });
      setTimeout(() => {
        wx.reLaunch({
          url: '/pages/login/login'
        });
      }, 1500);
      return;
    }
    
    // 原有逻辑
    this.loadServiceTypes();
    this.getUserInfo();
    this.prepareDateList();
  },

  // 预填联系人
  getUserInfo() {
    const app = getApp();
    if (app && app.globalData && app.globalData.userInfo) {
      this.setData({
        contactName: app.globalData.userInfo.nickname || '',
        contactPhone: app.globalData.userInfo.phone || ''
      });
    }
  },

  // 尝试从后端加载服务类型，失败则回退到默认数组
  loadServiceTypes() {
    const app = getApp();
    const url = `${app.globalData.baseUrl}/system/service-types`;
    console.log('加载服务类型，URL=', url);

    wx.request({
      url,
      method: 'GET',
      success: (res) => {
        // 兼容后端两种风格： code === 0 / code === 200
        const ok = res && res.data && (res.data.code === 0 || res.data.code === 200);
        if (ok && Array.isArray(res.data.data) && res.data.data.length > 0) {
          console.log('从后端加载到服务类型：', res.data.data);
          this.setData({ serviceTypes: res.data.data });
        } else {
          console.warn('后端返回的 service-types 格式不符合预期，回退到默认值', res && res.data);
          this.setData({ serviceTypes: DEFAULT_SERVICE_TYPES });
        }
        // 根据第一个服务类型预付金额更新展示（如有）
        const st = (this.data.serviceTypes || [])[0] || {};
        const amount = (st.prepay_amount != null) ? Number(st.prepay_amount).toFixed(2) : this.data.prepayAmount;
        this.setData({ prepayAmount: amount });
      },
      fail: (err) => {
        console.warn('获取 service-types 失败，使用默认值。错误：', err);
        this.setData({ serviceTypes: DEFAULT_SERVICE_TYPES });
        const st = (DEFAULT_SERVICE_TYPES || [])[0] || {};
        const amount = (st.prepay_amount != null) ? Number(st.prepay_amount).toFixed(2) : this.data.prepayAmount;
        this.setData({ prepayAmount: amount });
      }
    });
  },

  // 选择服务类型；模板中应使用 selectedServiceTypeId 判定高亮
  selectServiceType(e) {
    const index = e.currentTarget.dataset.index;
    // 防护：若 index 未定义，尝试用 data-id 字段
    if (typeof index === 'undefined') {
      const id = e.currentTarget.dataset.id;
      const found = this.data.serviceTypes.find(s => s.id == id);
      this.setData({
        selectedServiceTypeId: id,
        selectedServiceType: found || null
      });
      return;
    }

    const selected = this.data.serviceTypes[index];
    if (!selected) return;
    this.setData({
      selectedServiceTypeId: selected.id,
      selectedServiceType: selected,
      prepayAmount: (selected.prepay_amount != null) ? Number(selected.prepay_amount).toFixed(2) : this.data.prepayAmount
    });
    this.updateSubmitEnable();
  },

  // 文本输入处理
  onDescriptionInput(e) {
    this.setData({ description: e.detail.value });
    this.updateSubmitEnable();
  },
  // 联系人输入已移除（保留空方法以兼容旧绑定，不再使用）
  onContactNameInput() {},
  onContactPhoneInput() {},

  // 上传图片（简化）
  chooseImage() {
    wx.chooseImage({
      count: 3 - (this.data.images?.length || 0),
      success: (res) => {
        this.setData({ images: [...(this.data.images || []), ...res.tempFilePaths] });
      }
    });
  },

  // 作为辅助入口：从地图选择一个临时地址（不要求联系人）
  openMapChoose() {
    const that = this;
    wx.chooseLocation({
      success(res) {
        const full = (res.address && res.name) ? `${res.address}${res.name}` : (res.address || res.name || '');
        that.setData({
          selectedAddress: { contactName: '', contactPhone: '', province: '', city: '', district: '', detail: full },
          selectedAddressStr: full,
          latitude: res.latitude,
          longitude: res.longitude
        });
        that.updateSubmitEnable();
      },
      fail(err) {
        console.error('chooseLocation 失败：', err);
        wx.showToast({ title: '选择地址失败', icon: 'none' });
      }
    });
  },

  // 地址弹层与加载
  openAddressSheet() {
    this.setData({ showAddressSheet: true });
    this.loadAddresses();
  },
  closeAddressSheet() {
    this.setData({ showAddressSheet: false });
  },
  loadAddresses() {
    this.setData({ loadingAddresses: true });
    const app = getApp();
    wx.request({
      url: `${app.globalData.baseUrl}/addresses`,
      method: 'GET',
      header: { 'Authorization': `Bearer ${app.globalData.token}` },
      success: (res) => {
        this.setData({ loadingAddresses: false });
        if (res.data.code === 0 || res.data.code === 200) {
          const list = (res.data.data && res.data.data.addresses) || [];
          const mapped = list.map(item => ({
            id: item.id,
            contactName: item.contact_name || item.contactName || '',
            contactPhone: item.contact_phone || item.contactPhone || '',
            province: item.province || '',
            city: item.city || '',
            district: item.district || '',
            detail: item.detail_address || item.detail || '',
            isDefault: !!item.is_default,
            latitude: item.latitude ?? null,
            longitude: item.longitude ?? null
          }));
          this.setData({ addresses: mapped });
        } else {
          wx.showToast({ title: res.data.message || '加载失败', icon: 'none' });
        }
      },
      fail: () => {
        this.setData({ loadingAddresses: false });
        wx.showToast({ title: '加载失败', icon: 'none' });
      }
    });
  },
  selectAddress(e) {
    const address = e.currentTarget.dataset.address;
    const addrStr = `${address.province || ''}${address.city || ''}${address.district || ''}${address.detail || ''}`;
    this.setData({
      selectedAddress: address,
      selectedAddressStr: addrStr,
      contactName: address.contactName || '',
      contactPhone: address.contactPhone || '',
      latitude: address.latitude ?? null,
      longitude: address.longitude ?? null
    });
    this.updateSubmitEnable();
    this.closeAddressSheet();
  },
  editAddress(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/address/edit/edit?id=${id}` });
  },
  addAddress() {
    wx.navigateTo({ url: '/pages/address/edit/edit' });
  },

  // 时间弹层与选择
  openTimeSheet() {
    this.setData({ showTimeSheet: true });
  },
  closeTimeSheet() {
    this.setData({ showTimeSheet: false });
  },
  prepareDateList() {
    const list = [];
    const now = new Date();
    for (let i = 0; i < 10; i++) {
      const d = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
      const labelPrefix = i === 0 ? '今天' : i === 1 ? '明天' : i === 2 ? '后天' : `周${'日一二三四五六'[d.getDay()]}`;
      const label = `${labelPrefix} ${d.getMonth()+1}月${d.getDate()}日`;
      list.push({ date: d, label });
    }
    this.setData({ dateList: list, selectedDateIndex: 0 });
  },
  selectDate(e) {
    const index = e.currentTarget.dataset.index;
    this.setData({ selectedDateIndex: index });
  },
  selectSlot(e) {
    const slot = e.currentTarget.dataset.slot;
    this.setData({ selectedSlot: slot });
  },
  confirmTime() {
    const date = this.data.dateList[this.data.selectedDateIndex];
    if (!date || !this.data.selectedSlot) {
      wx.showToast({ title: '请选择日期和时间段', icon: 'none' });
      return;
    }
    const expectedStr = `${date.label} ${this.data.selectedSlot}`;
    // 将时段的开始时间转换为ISO字符串，保留本地时区偏移
    const [startStr] = this.data.selectedSlot.split('-');
    const [hh, mm] = (startStr || '00:00').split(':').map(s => parseInt(s, 10) || 0);
    const base = date.date; // 实际日期对象
    const y = base.getFullYear();
    const m = base.getMonth() + 1;
    const d = base.getDate();
    const pad = (n) => (n < 10 ? `0${n}` : `${n}`);
    const tzMinutes = -new Date().getTimezoneOffset(); // 本地时区偏移，单位分钟
    const sign = tzMinutes >= 0 ? '+' : '-';
    const tzAbs = Math.abs(tzMinutes);
    const tzH = Math.floor(tzAbs / 60);
    const tzM = tzAbs % 60;
    const iso = `${y}-${pad(m)}-${pad(d)}T${pad(hh)}:${pad(mm)}:00${sign}${pad(tzH)}:${pad(tzM)}`;
    this.setData({ expectedTimeStr: expectedStr, expectedTimeIso: iso });
    this.updateSubmitEnable();
    this.closeTimeSheet();
  },

  // 表单验证
  validateForm() {
    if (!this.data.selectedServiceTypeId) {
      wx.showToast({ title: '请选择服务类型', icon: 'none' });
      return false;
    }
    if (!this.data.description || !this.data.description.trim()) {
      wx.showToast({ title: '请描述问题详情', icon: 'none' });
      return false;
    }
    if (!this.data.selectedAddressStr) {
      wx.showToast({ title: '请选择服务地址', icon: 'none' });
      return false;
    }
    // 联系人手机号若存在则校验；允许为空（地址中已包含）
    if (this.data.contactPhone && !/^1[3-9]\d{9}$/.test(this.data.contactPhone)) {
      wx.showToast({ title: '联系人手机号格式不正确', icon: 'none' });
      return false;
    }
    if (!this.data.expectedTimeStr) {
      wx.showToast({ title: '请选择上门时间', icon: 'none' });
      return false;
    }
    return true;
  },

  // 提交订单（字段名与后端保持一致）
  submitOrder() {
    if (!this.validateForm()) return;
    if (this.data.submitting) return;

    this.setData({ submitting: true });
    const app = getApp();

    const payload = {
      service_type_id: this.data.selectedServiceType.id,
      title: this.data.selectedServiceType.name || '无标题',
      description: this.data.description || '',
      contact_name: this.data.contactName || '',
      contact_phone: this.data.contactPhone || '',
      service_address: this.data.selectedAddressStr,
      latitude: this.data.latitude,
      longitude: this.data.longitude,
      expected_time: this.data.expectedTimeIso || null,
      images: this.data.images || []
    };

    console.log('提交的订单 payload:', payload);

    wx.request({
      url: `${app.globalData.baseUrl}/orders`,
      method: 'POST',
      header: { 'Authorization': `Bearer ${app.globalData.token}`, 'Content-Type': 'application/json' },
      data: payload,
      success: (res) => {
        this.setData({ submitting: false });
        console.log('创建订单返回：', res && res.data);
        if (res && res.data && (res.data.code === 0 || res.data.code === 200)) {
          wx.showToast({ title: '正在支付', icon: 'none' });
          const orderId = res.data.data?.id || res.data.id;
          setTimeout(() => {
            wx.navigateTo({ url: `/pages/payment/payment/payment?orderId=${orderId}` });
          }, 500);
        } else {
          wx.showToast({ title: res.data?.message || '提交失败', icon: 'none' });
        }
      },
      fail: (err) => {
        this.setData({ submitting: false });
        console.error('提交订单失败：', err);
        wx.showToast({ title: '网络错误，请重试', icon: 'none' });
      }
    });
  }
  ,
  updateSubmitEnable() {
    const ok = !!this.data.selectedServiceTypeId && !!(this.data.description && this.data.description.trim()) && !!this.data.selectedAddressStr && !!this.data.expectedTimeStr;
    this.setData({ canSubmit: ok });
  }
});
