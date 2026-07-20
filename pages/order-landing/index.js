// pages/order-landing/index.js — 分享/扫码独立落地页
// 与 pages/order/create/create.js 功能一致，差异：
//   - onLoad 先匿名登录，不跳登录页
//   - submitOrder 提交后页面显示成功状态，不跳转支付页
//   - 自动携带 referrer_id
const plugin = requirePlugin('WechatSI')
const manager = plugin.getRecordRecognitionManager()

const SERVICE_TYPE_DISPLAY_MAP = {
  '电路维修': '电工维修',
  '开关插座': '电工安装'
};

const SERVICE_TYPE_WHITELIST = Object.keys(SERVICE_TYPE_DISPLAY_MAP);

const RAW_SERVICE_TYPES = [
  { id: 1, name: '电路维修', icon: '🔌' },
  { id: 2, name: '开关插座', icon: '🔘' },
  { id: 3, name: '灯具安装', icon: '💡' },
  { id: 4, name: '其他电工服务', icon: '⚡' }
];

const DEFAULT_SERVICE_TYPES = formatServiceTypes(RAW_SERVICE_TYPES);

function formatServiceTypes(list = []) {
  return (list || [])
    .filter(item => SERVICE_TYPE_WHITELIST.includes(item.name))
    .map(item => ({
      ...item,
      name: SERVICE_TYPE_DISPLAY_MAP[item.name] || item.name
    }));
}

function calculateCurrentPrepayAmount(feeList = []) {
  if (!Array.isArray(feeList) || feeList.length === 0) return 20;
  const hour = new Date().getHours();
  for (const fee of feeList) {
    if (fee.period_key === 'night') {
      if (hour >= fee.start_hour || hour < fee.end_hour) return Number(fee.amount) || 20;
    } else {
      if (hour >= fee.start_hour && hour < fee.end_hour) return Number(fee.amount) || 20;
    }
  }
  return 20;
}

Page({
  data: {
    // 匿名登录状态
    token: '',
    userId: null,
    hasPhone: false,
    referrerId: null,
    loggedIn: false,
    loginError: '',
    // 提交成功状态
    orderSubmitted: false,
    submittedOrderNo: '',

    serviceTypes: [],
    selectedServiceTypeId: null,
    selectedServiceType: null,
    description: '',
    images: [],
    contactName: '',
    contactPhone: '',
    showAddressSheet: false,
    loadingAddresses: false,
    addresses: [],
    selectedAddress: null,
    selectedAddressStr: '',
    latitude: '',
    longitude: '',
    descriptionTitle: '故障描述',
    prepayAmount: '30.00',
    canSubmit: false,
    submitting: false,
    agreePrepayTerms: false,
    electricityType: 'residential',
    isDirected: false,
    workNo: '',
    searchingElectrician: false,
    searchedElectrician: null,
    searchEmpty: false,
    // 语音输入相关
    isRecording: false,
    showRecordPanel: false,
    realtimeText: '',
    confirmedText: '',
    waveBars: [20, 35, 50, 65, 80, 65, 50, 35, 20],
    // 企业多日工程
    userType: 'user',
    orderMode: 'quick',
    projRequiredCount: 2,
    projRequiredRange: Array.from({ length: 29 }, (_, i) => i + 2),
    projStartDate: '',
    projStartTime: '',
    projEndDate: '',
    projEndTime: '',
    projCertLowChecked: true,
    projCertHighChecked: false,
    projTotalAmount: '',
    projElectricianFee: '',
    projectRegion: ['', '', ''],
    projectAddressDetail: '',
    enterpriseCertDistrict: '',
    projectSubmitting: false
  },

  onLoad(options) {
    // 解析推荐人 ID
    let referrerId = null;
    if (options && options.scene) {
      const sceneStr = decodeURIComponent(options.scene);
      const match = sceneStr.match(/(\d+)/);
      if (match) referrerId = match[1];
    }
    if (options && options.referrer_id) {
      referrerId = options.referrer_id;
    }
    if (!referrerId) {
      referrerId = wx.getStorageSync('referrer_id') || null;
    }
    this.setData({ referrerId });

    // 初始化语音识别
    this._initVoice();

    // 匿名登录后再加载服务类型
    this._anonymousLogin();
  },

  onShow() {
    if (this.data.showAddressSheet) this.loadAddresses();
  },

  onUnload() {
    clearInterval(this._waveTimer);
  },

  noop() {},

  // ── 匿名登录 ──
  async _anonymousLogin() {
    wx.showLoading({ title: '加载中...' });
    try {
      const loginRes = await new Promise((resolve, reject) => {
        wx.login({ success: resolve, fail: reject });
      });
      if (!loginRes.code) throw new Error('微信登录失败');

      const res = await new Promise((resolve, reject) => {
        wx.request({
          url: `${getApp().globalData.baseUrl}/auth/anonymous-login`,
          method: 'POST',
          data: { code: loginRes.code },
          success: resolve,
          fail: reject
        });
      });

      wx.hideLoading();

      if (res.data && (res.data.code === 200 || res.data.success)) {
        const data = res.data.data || {};
        this.setData({
          token: data.token,
          userId: data.user?.id,
          hasPhone: data.user?.has_phone || false,
          contactPhone: data.user?.phone || '',
          loggedIn: true,
          loginError: ''
        });
        getApp().globalData.token = data.token;

        // 登录成功后加载服务类型等数据
        this.loadServiceTypes();
        this.getUserInfo();
      } else {
        this.setData({ loginError: res.data?.message || '登录失败，请重试' });
      }
    } catch (err) {
      wx.hideLoading();
      this.setData({ loginError: '网络错误，请重试' });
    }
  },

  // ─── 语音输入 ─────────────────────────────────────────────

  _initVoice() {
    manager.onRecognize = (res) => {
      if (res.result) {
        this.setData({ realtimeText: res.result });
      }
    };
    manager.onStart = () => {
      this._waveTimer = setInterval(() => {
        this.setData({
          waveBars: Array.from({ length: 9 }, () => Math.floor(Math.random() * 70) + 10)
        });
      }, 120);
    };
    manager.onStop = (res) => {
      clearInterval(this._waveTimer);
      this.setData({
        isRecording: false,
        waveBars: [20, 35, 50, 65, 80, 65, 50, 35, 20],
        realtimeText: res.result || this.data.realtimeText,
        confirmedText: res.result || this.data.realtimeText,
      });
    };
    manager.onError = () => {
      clearInterval(this._waveTimer);
      this.setData({
        isRecording: false,
        waveBars: [20, 35, 50, 65, 80, 65, 50, 35, 20],
      });
      wx.showToast({ title: '识别失败，请重试', icon: 'none' });
    };
  },

  onMicTap() {
    if (this.data.isRecording) {
      manager.stop();
      return;
    }
    wx.authorize({
      scope: 'scope.record',
      success: () => {
        this.setData({
          isRecording: true,
          showRecordPanel: true,
          realtimeText: '',
          confirmedText: '',
        });
        manager.start({ duration: 60000, lang: 'zh_CN' });
      },
      fail: () => {
        wx.showModal({
          title: '需要麦克风权限',
          content: '请在右上角菜单 → 设置 中开启麦克风权限',
          showCancel: false
        });
      }
    });
  },

  onRecordConfirm() {
    if (this.data.isRecording) {
      manager.stop();
      setTimeout(() => { this._commitText(); }, 300);
    } else {
      this._commitText();
    }
  },

  _commitText() {
    const recognized = this.data.confirmedText || this.data.realtimeText;
    if (recognized) {
      const current = this.data.description || '';
      this.setData({ description: current + recognized });
      this.updateSubmitEnable();
    }
    this.setData({
      showRecordPanel: false,
      isRecording: false,
      realtimeText: '',
      confirmedText: '',
    });
  },

  onRecordClose() {
    if (this.data.isRecording) { manager.stop(); }
    clearInterval(this._waveTimer);
    this.setData({
      showRecordPanel: false,
      isRecording: false,
      realtimeText: '',
      confirmedText: '',
      waveBars: [20, 35, 50, 65, 80, 65, 50, 35, 20],
    });
  },

  // ─── 业务逻辑 ────────────────────────────────────────────

  getUserInfo() {
    const app = getApp();
    if (app && app.globalData && app.globalData.userInfo) {
      this.setData({
        contactName: app.globalData.userInfo.nickname || '',
        contactPhone: app.globalData.userInfo.phone || ''
      });
    }
  },

  loadServiceTypes() {
    const app = getApp();
    const serviceTypesUrl = `${app.globalData.baseUrl}/system/service-types`;
    const timePeriodFeesUrl = `${app.globalData.baseUrl}/system/time-period-fees`;
    Promise.all([
      new Promise((resolve, reject) => {
        wx.request({ url: serviceTypesUrl, method: 'GET', success: resolve, fail: reject });
      }),
      new Promise((resolve, reject) => {
        wx.request({ url: timePeriodFeesUrl, method: 'GET', success: resolve, fail: reject });
      })
    ]).then(([serviceTypesRes, timePeriodFeesRes]) => {
      let prepayAmount = this.data.prepayAmount;
      const ok = timePeriodFeesRes && timePeriodFeesRes.data &&
        (timePeriodFeesRes.data.code === 0 || timePeriodFeesRes.data.code === 200);
      if (ok && Array.isArray(timePeriodFeesRes.data.data.fees)) {
        prepayAmount = calculateCurrentPrepayAmount(timePeriodFeesRes.data.data.fees).toFixed(2);
      }
      const serviceOk = serviceTypesRes && serviceTypesRes.data &&
        (serviceTypesRes.data.code === 0 || serviceTypesRes.data.code === 200);
      if (serviceOk && Array.isArray(serviceTypesRes.data.data) && serviceTypesRes.data.data.length > 0) {
        const formatted = formatServiceTypes(serviceTypesRes.data.data);
        if (formatted.length > 0) {
          this.setData({ serviceTypes: formatted, prepayAmount });
        } else {
          this.setData({ serviceTypes: DEFAULT_SERVICE_TYPES, prepayAmount });
        }
      } else {
        this.setData({ serviceTypes: DEFAULT_SERVICE_TYPES, prepayAmount });
      }
    }).catch(() => {
      this.setData({ serviceTypes: DEFAULT_SERVICE_TYPES });
    });
  },

  selectServiceType(e) {
    const index = e.currentTarget.dataset.index;
    if (typeof index === 'undefined') {
      const id = e.currentTarget.dataset.id;
      const found = this.data.serviceTypes.find(s => s.id == id);
      this.setData({
        selectedServiceTypeId: id,
        selectedServiceType: found || null,
        descriptionTitle: this.getDescriptionTitle(found?.name)
      });
      return;
    }
    const selected = this.data.serviceTypes[index];
    if (!selected) return;
    this.setData({
      selectedServiceTypeId: selected.id,
      selectedServiceType: selected,
      descriptionTitle: this.getDescriptionTitle(selected.name)
    });
    this.updateSubmitEnable();
  },

  getDescriptionTitle(serviceName) {
    return serviceName === '电工安装' ? '工程描述' : '故障描述';
  },

  onDescriptionInput(e) {
    this.setData({ description: e.detail.value });
    this.updateSubmitEnable();
  },

  onContactNameInput() {},
  onContactPhoneInput() {},

  chooseImage() {
    const current = Array.isArray(this.data.images) ? this.data.images : [];
    const remaining = 5 - current.length;
    if (remaining <= 0) {
      wx.showToast({ title: '最多上传5张图片', icon: 'none' });
      return;
    }
    wx.chooseImage({
      count: remaining,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const next = [...current, ...(res.tempFilePaths || [])].slice(0, 5);
        this.setData({ images: next });
      }
    });
  },

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
      header: { 'Authorization': `Bearer ${this.data.token}` },
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

  onAgreeChange(e) {
    const values = e.detail.value || [];
    const agreed = Array.isArray(values) ? values.includes('agree') : !!values;
    this.setData({ agreePrepayTerms: agreed });
    this.updateSubmitEnable();
  },

  onElectricityTypeChange(e) {
    this.setData({ electricityType: e.detail.value });
    this.updateSubmitEnable();
  },

  onDirectedToggle(e) {
    this.setData({ isDirected: e.detail.value, workNo: '', searchedElectrician: null, searchEmpty: false });
    this.updateSubmitEnable();
  },

  onWorkNoInput(e) {
    this.setData({ workNo: e.detail.value, searchedElectrician: null, searchEmpty: false });
    this.updateSubmitEnable();
  },

  searchElectrician() {
    const workNo = (this.data.workNo || '').trim();
    if (workNo.length < 8) {
      wx.showToast({ title: '请输入完整工号（8位）', icon: 'none' });
      return;
    }
    this.setData({ searchingElectrician: true, searchedElectrician: null, searchEmpty: false });
    const app = getApp();
    wx.request({
      url: `${app.globalData.baseUrl}/electricians/search-by-workno`,
      method: 'GET',
      data: { workNo },
      success: (res) => {
        this.setData({ searchingElectrician: false });
        if (res.data && (res.data.code === 0 || res.data.code === 200)) {
          const electrician = res.data.data?.electrician || null;
          if (electrician) {
            this.setData({ searchedElectrician: electrician, searchEmpty: false });
          } else {
            this.setData({ searchedElectrician: null, searchEmpty: true });
          }
        } else {
          this.setData({ searchEmpty: true });
        }
        this.updateSubmitEnable();
      },
      fail: () => {
        this.setData({ searchingElectrician: false, searchEmpty: true });
        wx.showToast({ title: '搜索失败，请重试', icon: 'none' });
      }
    });
  },

  validateForm() {
    if (!this.data.selectedServiceTypeId) {
      wx.showToast({ title: '请选择服务类型', icon: 'none' });
      return false;
    }
    if (!this.data.description || !this.data.description.trim()) {
      wx.showToast({ title: '请描述问题详情', icon: 'none' });
      return false;
    }
    if (!this.data.isDirected && !this.data.selectedAddressStr) {
      wx.showToast({ title: '请选择服务地址', icon: 'none' });
      return false;
    }
    if (this.data.isDirected && !this.data.searchedElectrician) {
      wx.showToast({ title: '请搜索并选择电工', icon: 'none' });
      return false;
    }
    if (!this.data.electricityType) {
      wx.showToast({ title: '请选择用电类型', icon: 'none' });
      return false;
    }
    if (this.data.contactPhone && !/^1[3-9]\d{9}$/.test(this.data.contactPhone)) {
      wx.showToast({ title: '联系人手机号格式不正确', icon: 'none' });
      return false;
    }
    if (!this.data.agreePrepayTerms) {
      wx.showToast({ title: '请勾选预付款说明', icon: 'none' });
      return false;
    }
    return true;
  },

  uploadImage(filePath) {
    return new Promise((resolve, reject) => {
      const app = getApp();
      wx.uploadFile({
        url: `${app.globalData.baseUrl}/upload/order`,
        filePath,
        name: 'order_image',
        header: { 'Authorization': `Bearer ${this.data.token}` },
        success: (res) => {
          try {
            const data = JSON.parse(res.data);
            if ((data.code === 0 || data.code === 200) && data.data && data.data.url) {
              resolve(data.data.url);
            } else {
              reject(new Error(data.message || '上传失败'));
            }
          } catch (e) {
            reject(new Error('解析响应失败'));
          }
        },
        fail: () => { reject(new Error('网络错误')); }
      });
    });
  },

  async submitOrder() {
    if (!this.validateForm()) return;
    if (this.data.submitting) return;
    this.setData({ submitting: true });

    let imageUrls = [];
    const localImages = this.data.images || [];
    if (localImages.length > 0) {
      wx.showLoading({ title: '上传图片中...', mask: true });
      try {
        imageUrls = await Promise.all(localImages.map(p => this.uploadImage(p)));
        wx.hideLoading();
      } catch (err) {
        wx.hideLoading();
        wx.showToast({ title: err.message || '图片上传失败', icon: 'none' });
        this.setData({ submitting: false });
        return;
      }
    }

    const payload = {
      service_type_id: this.data.selectedServiceType.id,
      title: this.data.selectedServiceType.name || '无标题',
      description: this.data.description || '',
      contact_name: this.data.contactName || '',
      contact_phone: this.data.contactPhone || '',
      service_address: this.data.isDirected ? '' : this.data.selectedAddressStr,
      latitude: this.data.isDirected ? null : this.data.latitude,
      longitude: this.data.isDirected ? null : this.data.longitude,
      images: imageUrls,
      address_id: this.data.isDirected ? null : (this.data.selectedAddress?.id || null),
      electricity_type: this.data.electricityType,
      isDirected: this.data.isDirected,
      electricianId: this.data.isDirected ? (this.data.searchedElectrician?.id || null) : null,
      referrerId: this.data.referrerId
    };

    wx.request({
      url: `${getApp().globalData.baseUrl}/orders`,
      method: 'POST',
      header: { 'Authorization': `Bearer ${this.data.token}`, 'Content-Type': 'application/json' },
      data: payload,
      success: (res) => {
        this.setData({ submitting: false });
        if (res && res.data && (res.data.code === 200 || res.data.success)) {
          const orderId = res.data.data?.id;
          wx.showToast({ title: '下单成功', icon: 'success' });
          if (orderId) {
            // 跳转到独立订单详情页（用户停留在此）
            setTimeout(() => {
              wx.redirectTo({
                url: `/pages/order-landing-detail/index?id=${orderId}`
              });
            }, 800);
          } else {
            this.setData({
              orderSubmitted: true,
              submittedOrderNo: res.data.data?.order_no || ''
            });
          }
        } else {
          wx.showToast({ title: res.data?.message || '提交失败', icon: 'none' });
        }
      },
      fail: () => {
        this.setData({ submitting: false });
        wx.showToast({ title: '网络错误，请重试', icon: 'none' });
      }
    });
  },

  updateSubmitEnable() {
    let ok = !!this.data.selectedServiceTypeId
      && !!(this.data.description && this.data.description.trim())
      && !!this.data.agreePrepayTerms;
    if (this.data.isDirected) {
      ok = ok && !!this.data.searchedElectrician;
    } else {
      ok = ok && !!this.data.selectedAddressStr;
    }
    this.setData({ canSubmit: ok });
  },

  // ─── 企业多日工程 ────────────────────────────────────────────

  loadEnterpriseCert() {
    const app = getApp();
    wx.request({
      url: `${app.globalData.baseUrl}/miniprogram/enterprise/certification`,
      method: 'GET',
      header: { 'Authorization': `Bearer ${this.data.token}` },
      success: (res) => {
        const ok = res?.data?.success === true || res?.data?.code === 0 || res?.data?.code === 200;
        if (ok && res.data.data && res.data.data.certStatus === 'approved') {
          this.setData({ enterpriseCertDistrict: res.data.data.district || '' });
        }
      }
    });
  },

  switchOrderMode(e) {
    const mode = e.currentTarget.dataset.mode;
    this.setData({ orderMode: mode });
    this.updateProjectSubmitEnable();
  },

  onProjCountChange(e) {
    const idx = e.detail.value;
    const count = this.data.projRequiredRange[idx];
    this.setData({ projRequiredCount: count });
    this.calcElectricianFee();
    this.updateProjectSubmitEnable();
  },

  onProjDateChange(e) {
    const { field } = e.currentTarget.dataset;
    const val = e.detail.value;
    this.setData({ [field]: val });
    this.updateProjectSubmitEnable();
  },

  onProjCertChange(e) {
    const values = e.detail.value || [];
    this.setData({
      projCertLowChecked: values.includes('low_voltage'),
      projCertHighChecked: values.includes('high_voltage')
    });
    this.updateProjectSubmitEnable();
  },

  onProjAmountInput(e) {
    this.setData({ projTotalAmount: e.detail.value });
    this.calcElectricianFee();
    this.updateProjectSubmitEnable();
  },

  onProjectRegionChange(e) {
    this.setData({ projectRegion: e.detail.value });
    this.updateProjectSubmitEnable();
  },

  onProjectAddressInput(e) {
    this.setData({ projectAddressDetail: e.detail.value });
    this.updateProjectSubmitEnable();
  },

  calcElectricianFee() {
    const amount = parseFloat(this.data.projTotalAmount);
    const count = this.data.projRequiredCount;
    if (amount > 0 && count > 0) {
      const fee = ((amount * 0.85) / count).toFixed(2);
      this.setData({ projElectricianFee: fee });
    } else {
      this.setData({ projElectricianFee: '' });
    }
  },

  updateProjectSubmitEnable() {
    const { projStartDate, projStartTime, projEndDate, projEndTime, projTotalAmount, projectRegion, projectAddressDetail } = this.data;
    const ok = projStartDate && projStartTime && projEndDate && projEndTime
      && parseFloat(projTotalAmount) > 0
      && projectRegion[0] && projectRegion[1] && projectRegion[2]
      && projectAddressDetail && projectAddressDetail.trim();
    this.setData({ canSubmit: ok });
  },

  validateProjectForm() {
    const { projStartDate, projStartTime, projEndDate, projEndTime,
            projCertLowChecked, projCertHighChecked,
            projTotalAmount, projectRegion, projectAddressDetail,
            enterpriseCertDistrict, contactPhone } = this.data;

    if (!projStartDate || !projStartTime || !projEndDate || !projEndTime) {
      wx.showToast({ title: '请完整选择工程起止日期和时间', icon: 'none' }); return false;
    }

    const start = new Date((projStartDate + 'T' + projStartTime).replace(/-/g, '/'));
    const end = new Date((projEndDate + 'T' + projEndTime).replace(/-/g, '/'));
    const diffHours = (end - start) / (1000 * 60 * 60);
    const diffDays = (end - start) / (1000 * 60 * 60 * 24);
    if (diffHours < 8) {
      wx.showToast({ title: '工程时间段不能少于8小时', icon: 'none' }); return false;
    }
    if (diffDays > 29) {
      wx.showToast({ title: '工程时间段不能超过29天', icon: 'none' }); return false;
    }
    if (diffHours <= 0) {
      wx.showToast({ title: '结束时间必须晚于开始时间', icon: 'none' }); return false;
    }

    if (!projCertLowChecked && !projCertHighChecked) {
      wx.showToast({ title: '请至少选择一种持证要求', icon: 'none' }); return false;
    }

    if (!projectRegion[0] || !projectRegion[1] || !projectRegion[2]) {
      wx.showToast({ title: '请选择完整的省市区', icon: 'none' }); return false;
    }
    if (!projectAddressDetail.trim()) {
      wx.showToast({ title: '请填写详细地址', icon: 'none' }); return false;
    }

    if (enterpriseCertDistrict && projectRegion[2] !== enterpriseCertDistrict) {
      wx.showToast({ title: `工单地址区(${projectRegion[2]})须与企业认证区(${enterpriseCertDistrict})一致`, icon: 'none' });
      return false;
    }

    if (!parseFloat(projTotalAmount) || parseFloat(projTotalAmount) <= 0) {
      wx.showToast({ title: '请输入有效的工单总费用', icon: 'none' }); return false;
    }

    if (contactPhone && !/^1[3-9]\d{9}$/.test(contactPhone)) {
      wx.showToast({ title: '联系电话格式不正确', icon: 'none' }); return false;
    }

    return true;
  },

  async submitProjectOrder() {
    if (!this.validateProjectForm()) return;
    if (this.data.projectSubmitting) return;
    this.setData({ projectSubmitting: true });

    const app = getApp();
    const { description, projRequiredCount, projStartDate, projStartTime,
            projEndDate, projEndTime, projCertLowChecked, projCertHighChecked,
            projTotalAmount, contactPhone, projectRegion, projectAddressDetail } = this.data;

    const certReqs = [];
    if (projCertLowChecked) certReqs.push('low_voltage');
    if (projCertHighChecked) certReqs.push('high_voltage');
    const projCertRequirement = certReqs.join(',');

    const startDateTime = projStartDate + ' ' + projStartTime + ':00';
    const endDateTime = projEndDate + ' ' + projEndTime + ':00';

    const payload = {
      description: description || '',
      projRequiredCount: projRequiredCount,
      projStartTime: startDateTime,
      projEndTime: endDateTime,
      projCertRequirement: projCertRequirement,
      projTotalAmount: parseFloat(projTotalAmount),
      contactPhone: contactPhone || '',
      province: projectRegion[0],
      city: projectRegion[1],
      district: projectRegion[2],
      addressDetail: projectAddressDetail,
      referrerId: this.data.referrerId
    };

    wx.request({
      url: `${app.globalData.baseUrl}/miniprogram/enterprise/orders/project`,
      method: 'POST',
      header: { 'Authorization': `Bearer ${this.data.token}`, 'Content-Type': 'application/json' },
      data: payload,
      success: (res) => {
        this.setData({ projectSubmitting: false });
        if (res && res.data && (res.data.code === 200 || res.data.success)) {
          const orderId = res.data.data?.id;
          wx.showToast({ title: '下单成功', icon: 'success' });
          if (orderId) {
            setTimeout(() => {
              wx.redirectTo({
                url: `/pages/order-landing-detail/index?id=${orderId}`
              });
            }, 800);
          } else {
            this.setData({
              orderSubmitted: true,
              submittedOrderNo: res.data.data?.order_no || res.data.data?.id || ''
            });
          }
        } else {
          wx.showToast({ title: res.data?.message || '提交失败', icon: 'none' });
        }
      },
      fail: () => {
        this.setData({ projectSubmitting: false });
        wx.showToast({ title: '网络错误，请重试', icon: 'none' });
      }
    });
  },

  // ── 关闭页面 ──
  closePage() {
    wx.navigateBack({ delta: 1 });
  }
});
