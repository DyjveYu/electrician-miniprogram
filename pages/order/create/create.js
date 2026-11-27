const certOptions = require('../../../utils/orderCertificateOptions');
const projectOrder = require('../../../utils/projectOrder');
const enterpriseSession = require('../../../utils/enterpriseSession');
const orderEntry = require('../../../utils/orderEntry');
const personalOrder = require('../../../utils/personalOrder');
// pages/order/create/create.js
const plugin = requirePlugin('WechatSI')
const manager = plugin.getRecordRecognitionManager()
const SERVICE_TYPES = require('../../../config/service-types')

function supportsServiceMode({ serviceMode, userType, orderMode, enterpriseCount }) {
  if (serviceMode === 'on_site') return true;
  return serviceMode === 'off_site' && (userType === 'user' || (userType === 'enterprise' && enterpriseCount >= 1 && enterpriseCount <= 100));
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

require('../../../utils/visitCapture').register(Page, {
  data: {
    fromEnterpriseCertification: false, showCreateBack: false, showCreateHome: false,
    navigationTop: null, navigationHeight: null,
    enterpriseCount: 1, enterpriseCountRange: Array.from({ length: 100 }, (_, i) => i + 1),
    showProjectDates: false, projectDateConfirmed: false, projectDateSummary: '', projectDateError: '',
    draftStartDate: '', draftEndDate: '', draftStartLabel: '', draftEndLabel: '', minProjectDate: '',
    createdIsProject: false, createdOrderId: 0,
    serviceMode: 'on_site',
    requiredCertType: '', enterpriseLowChecked: false, enterpriseHighChecked: false, enterpriseConstructionChecked: false,
    showPrepay: false,
    createdPrepayAmount: '0.00',
    serviceTypes: [],
    selectedServiceTypeId: null,
    selectedServiceType: null,
    description: '',
    images: [],
    contactName: '',
    contactPhone: '',
    showAddressSheet: false,
    loadingAddresses: false,
    addressError: '',
    addressNextPage: 0,
    submissionUncertain: false,
    addresses: [],
    selectedAddress: null,
    selectedAddressStr: '',
    latitude: '',
    longitude: '',
    descriptionTitle: '订单描述',
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
    // 协议弹窗
    showAgreementModal: false,
    hasOpenedAgreement: false,
    realtimeText: '',
    confirmedText: '',
    waveBars: [20, 35, 50, 65, 80, 65, 50, 35, 20],
    // 企业多日工程
    userType: 'user',
    orderMode: 'quick',        // quick | project
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

  onLoad(options = {}) {
    const app = getApp();
    this._unloaded = false;
    this._referrerId = /^\d+$/.test(String(options.referrerId || '')) ? Number(options.referrerId) : null;
    this._account = orderEntry.key(app);
    this._addressGeneration = 0;
    this._selectionVersion = 0;
    this.setCreateNavigation(options, app);
    if (!app.globalData.token || !app.globalData.userInfo?.phone) {
      this._needsPhoneLogin = true;
      wx.showToast({ title: '请先登录', icon: 'none', duration: 1500 });
      wx.redirectTo({ url: '/pages/login/login?entry=personal-order' + (this._referrerId ? `&referrerId=${this._referrerId}` : '') });
      return;
    }
    // 检查用户类型
    const userType = app.globalData.userInfo.current_role;
    if (!['user', 'enterprise'].includes(userType)) {
      wx.reLaunch({ url: '/pages/index/index' });
      return;
    }
    this.setData({
      userType,
      requiredCertType: 'low_voltage',
      enterpriseLowChecked: userType === 'enterprise',
      minProjectDate: projectOrder.today()
    });
    if (userType === 'enterprise' && wx.setNavigationBarTitle) wx.setNavigationBarTitle({ title: '创建企业订单' });
    this.setData({ descriptionTitle: '订单服务内容文字描述', selectedServiceTypeId: SERVICE_TYPES[0].id, selectedServiceType: SERVICE_TYPES[0] });
    // 企业用户加载认证信息（用于区校验）
    if (userType === 'enterprise') {
      this.loadEnterpriseCert();
    }
    this.loadServiceTypes();
    this.getUserInfo();
    this._initVoice();
  },

  onShow() {
    this._visible = true;
    if (this._needsPhoneLogin) return;
    const app = getApp();
    if (app.checkFrozenAndRedirect()) return;
    if (!this._current()) {
      this.setData({ selectedAddress: null, selectedAddressStr: '', canSubmit: false });
      wx.reLaunch({ url: '/pages/index/index' });
      return;
    }
    if (this._createdOrderId) { this.setData({ showPrepay: true }); return; }
    if (this.data.userType === 'enterprise' && this._certNeedsRefresh) {
      this._certNeedsRefresh = false;
      this.loadEnterpriseCert();
    }
    if (this.data.selectedAddress?.id) this.refreshSelectedAddress(this.data.selectedAddress.id);
    else this.loadAddresses({ initial: true });
  },

  onHide() {
    this._visible = false;
    this._certNeedsRefresh = true;
    this._certQueryGeneration = (this._certQueryGeneration || 0) + 1;
  },

  onUnload() {
    this._unloaded = true;
    this._addressGeneration++;
    clearInterval(this._waveTimer);
  },

  setCreateNavigation(options, app) {
    const fromEnterpriseCertification = options.entry === 'enterprise-certification' &&
      app.globalData.userInfo?.current_role === 'enterprise' &&
      app.globalData.enterpriseCertification?.certStatus === 'approved';
    const hasPreviousPage = getCurrentPages().length > 1;
    this.setData({
      fromEnterpriseCertification,
      showCreateBack: fromEnterpriseCertification || hasPreviousPage,
      showCreateHome: !fromEnterpriseCertification && !hasPreviousPage
    });
    try {
      const capsule = wx.getMenuButtonBoundingClientRect?.();
      if (capsule?.top > 0 && capsule.height > 0) {
        this.setData({ navigationTop: capsule.top, navigationHeight: capsule.height });
      }
    } catch (_) {
      // 部分运行环境无法提供胶囊尺寸，使用样式中的安全区兜底。
    }
  },

  goBack() {
    const home = () => wx.switchTab({ url: '/pages/index/index' });
    if (this.data.fromEnterpriseCertification || getCurrentPages().length <= 1) return home();
    wx.navigateBack({ fail: home });
  },

  // 空方法，防止弹层背景点击穿透
  noop() {},

  // ─── 语音输入 ────────────────────────────────────────────

  _initVoice() {
    // 实时识别回调：流式更新展示文字
    manager.onRecognize = (res) => {
      if (res.result) {
        this.setData({ realtimeText: res.result });
      }
    };

    // 录音开始：启动波形动画
    manager.onStart = () => {
      this._waveTimer = setInterval(() => {
        this.setData({
          waveBars: Array.from({ length: 9 }, () => Math.floor(Math.random() * 70) + 10)
        });
      }, 120);
    };

    // 录音结束：将最终识别文字存入 confirmedText，等待用户点"结束并输入文字"
    manager.onStop = (res) => {
      clearInterval(this._waveTimer);
      this.setData({
        isRecording: false,
        waveBars: [20, 35, 50, 65, 80, 65, 50, 35, 20],
        // 用最终结果覆盖实时文字（更准确）
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

  // 点击"语音输入"按钮：开始录音 / 再次点击停止录音
  onMicTap() {
    if (this.data.isRecording) {
      // 正在录音时再次点击 → 停止，让 onStop 回调处理文字
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

  // 点击"结束并输入文字"：停止录音，将文字写入输入框，关闭弹层
  onRecordConfirm() {
    if (this.data.isRecording) {
      // 先停止录音，onStop 回调会更新 confirmedText
      // 使用 wx.nextTick 确保 onStop 回调执行完毕后再写入
      manager.stop();
      // 稍等 onStop 回调完成后再写入（onStop 是同步触发但内部 setData 异步）
      setTimeout(() => {
        this._commitText();
      }, 300);
    } else {
      // 录音已自然结束，直接写入
      this._commitText();
    }
  },

  // 将识别文字追加进输入框，关闭弹层
  _commitText() {
    const recognized = this.data.confirmedText || this.data.realtimeText;
    if (recognized) {
      const current = this.data.description || '';
      const separator = current && !current.endsWith('\n') ? '' : '';
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

  // 点击"取消"或右上角 × ：丢弃识别结果，关闭弹层
  onRecordClose() {
    if (this.data.isRecording) {
      manager.stop();
    }
    clearInterval(this._waveTimer);
    this.setData({
      showRecordPanel: false,
      isRecording: false,
      realtimeText: '',
      confirmedText: '',
      waveBars: [20, 35, 50, 65, 80, 65, 50, 35, 20],
    });
  },

  // ─── 原有业务逻辑（保持不变）───────────────────────────

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
    // 服务类型从配置文件读取，不依赖后端
    this.setData({ serviceTypes: SERVICE_TYPES });
    // 仍请求时段费（预付款计算需要）
    enterpriseSession.request({
      url: `${app.globalData.baseUrl}/system/time-period-fees`,
      method: 'GET',
      success: (res) => {
        const ok = res.data && (res.data.code === 0 || res.data.code === 200);
        if (ok && Array.isArray(res.data.data.fees)) {
          this.setData({ prepayAmount: calculateCurrentPrepayAmount(res.data.data.fees).toFixed(2) });
        }
      }
    });
  },

  selectServiceType(e) {
    const index = e.currentTarget.dataset.index;
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
      selectedServiceType: selected
    });
    this.updateSubmitEnable();
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

  _current() { return !this._unloaded && !!this._account && this._account === orderEntry.key(getApp()); },

  _requestAddress(path) {
    const app = getApp();
    return new Promise((resolve, reject) => enterpriseSession.request({
      url: `${app.globalData.baseUrl}/addresses${path}`,
      header: { Authorization: `Bearer ${app.globalData.token}` },
      success: res => {
        if (res.statusCode === 200 && [0, 200].includes(res.data?.code)) resolve(res.data.data);
        else reject({ status: res.statusCode, message: res.data?.message || '地址加载失败' });
      },
      fail: () => reject({ message: '地址加载失败，请重试' })
    }));
  },

  _mapAddress(item) {
    return { id: item.id, contactName: item.contact_name || item.contactName || '', contactPhone: item.contact_phone || item.contactPhone || '',
      province: item.province || '', city: item.city || '', district: item.district || '', detail: item.detail_address || item.detail || '',
      isDefault: !!item.is_default, latitude: item.latitude ?? null, longitude: item.longitude ?? null };
  },

  _addressUsable(address) {
    return !!address?.id && [address.province, address.city, address.district, address.detail].every(v => typeof v === 'string' && v.trim()) &&
      (this.data.serviceMode === 'off_site' || this.data.orderMode !== 'project' || (!!this.data.enterpriseCertDistrict && address.district === this.data.enterpriseCertDistrict));
  },

  _applyAddress(address) {
    if (!this._current()) return;
    if (!this._addressUsable(address)) {
      this.setData({ showAddressSheet: true, addressError: '请选择符合本次订单条件的服务地址' });
      return;
    }
    this._selectionVersion++;
    this.setData({ selectedAddress: address, selectedAddressStr: `${address.province}${address.city}${address.district}${address.detail}`,
      contactName: address.contactName, contactPhone: address.contactPhone, latitude: address.latitude, longitude: address.longitude,
      projectRegion: [address.province, address.city, address.district], projectAddressDetail: address.detail,
      showAddressSheet: false, addressError: '' });
    this.updateAddressSubmit();
  },

  updateAddressSubmit() {
    if (this.data.orderMode === 'project') this.updateProjectSubmitEnable();
    else this.updateSubmitEnable();
  },

  openMapChoose() { this.addAddress(); },

  openAddressSheet() {
    if (!this._current()) return;
    this.setData({ showAddressSheet: true });
    this.loadAddresses();
  },

  closeAddressSheet() { this.setData({ showAddressSheet: false }); },

  async loadAddresses({ initial = false, page = 1 } = {}) {
    if (!this._current()) return;
    const generation = ++this._addressGeneration;
    const selection = this._selectionVersion;
    this.setData({ loadingAddresses: true, addressError: '' });
    try {
      const [result, defaults] = await Promise.all([
        this._requestAddress(`?page=${page}&limit=30`),
        initial ? this._requestAddress('/default') : Promise.resolve(null)
      ]);
      if (!this._current() || generation !== this._addressGeneration) return;
      const list = (result.addresses || []).map(item => this._mapAddress(item));
      this.setData({ addresses: page === 1 ? list : [...this.data.addresses, ...list], loadingAddresses: false,
        addressNextPage: result.pagination?.pages > page ? page + 1 : 0 });
      if (!initial || this._selectionVersion !== selection || this.data.selectedAddress || (this.data.isDirected && this.data.orderMode === 'quick')) return;
      if (defaults?.address) this._applyAddress(this._mapAddress(defaults.address));
      else if (list.length === 0 && (!result.pagination || result.pagination.total === 0) && !this._firstAddressPrompted) {
        this._firstAddressPrompted = true;
        this._promptFirstAddress();
      } else this.setData({ showAddressSheet: true });
    } catch (error) {
      if (this._current() && generation === this._addressGeneration) this.setData({ loadingAddresses: false, addressError: error.message || '地址加载失败，请重试', showAddressSheet: true });
    }
  },

  loadMoreAddresses() {
    if (!this.data.loadingAddresses && this.data.addressNextPage) this.loadAddresses({ page: this.data.addressNextPage });
  },

  _promptFirstAddress() {
    const proceed = () => { if (this._current() && (!this.data.isDirected || this.data.orderMode === 'project')) this.addAddress(); };
    wx.getSetting({
      success: result => {
        if (!this._current()) return;
        const status = result.authSetting?.['scope.userLocation'];
        if (status !== undefined) return proceed();
        wx.authorize({ scope: 'scope.userLocation', success: proceed, fail: proceed });
      }, fail: proceed
    });
  },

  selectAddress(e) { this._applyAddress(e.currentTarget.dataset.address); },

  async refreshSelectedAddress(id) {
    const selection = this._selectionVersion;
    try {
      const result = await this._requestAddress(`/${id}`);
      if (this._current() && selection === this._selectionVersion) this._applyAddress(this._mapAddress(result.address));
    } catch (error) {
      if (!this._current() || selection !== this._selectionVersion) return;
      if ([403, 404].includes(error.status)) {
        this.setData({ selectedAddress: null, selectedAddressStr: '', projectRegion: ['', '', ''], projectAddressDetail: '', showAddressSheet: true });
        this.updateAddressSubmit();
      }
      this.setData({ addressError: error.message || '地址加载失败，请重试' });
    }
  },

  _navigateAddress(id) {
    if (!this._current()) return;
    this._selectionVersion++;
    const account = this._account;
    wx.navigateTo({ url: `/pages/address/edit/edit?from=order-create${id ? `&id=${id}` : ''}`,
      events: { addressSaved: result => {
        if (this._current() && this._account === account && result.id) this.refreshSelectedAddress(result.id);
      } }
    });
  },

  editAddress(e) { this._navigateAddress(e.currentTarget.dataset.id); },
  addAddress() { this._navigateAddress(); },
  viewOrders() { wx.switchTab({ url: '/pages/order/list/list' }); },

  onAgreeChange(e) {
    const values = e.detail.value || [];
    const agreed = Array.isArray(values) ? values.includes('agree') : !!values;
    this.setData({ agreePrepayTerms: agreed });
    this.updateSubmitEnable();
  },

  // 协议弹窗
  onShowAgreement() {
    this.setData({ showAgreementModal: true, hasOpenedAgreement: true });
    this.updateSubmitEnable();
  },

  onCloseAgreement() {
    this.setData({ showAgreementModal: false });
  },

  onElectricityTypeChange(e) {
    this.setData({ electricityType: e.detail.value });
    this.updateSubmitEnable();
  },

  onDirectedToggle(e) {
    this.workNoSearch = null;
    this.setData({ isDirected: e.detail.value, workNo: '', searchedElectrician: null, searchEmpty: false, searchingElectrician: false });
    this.updateSubmitEnable();
  },

  onWorkNoInput(e) {
    this.workNoSearch = null;
    this.setData({ workNo: e.detail.value, searchedElectrician: null, searchEmpty: false, searchingElectrician: false });
    this.updateSubmitEnable();
  },

  searchElectrician() {
    const workNo = (this.data.workNo || '').trim();
    if (this.data.searchingElectrician) return;
    if (!/^(?:\d{6}|\d{8})$/.test(workNo)) {
      wx.showToast({ title: '请输入6位或8位电工工号', icon: 'none' });
      return;
    }
    const search = {};
    this.workNoSearch = search;
    this.setData({ searchingElectrician: true, searchedElectrician: null, searchEmpty: false });
    const app = getApp();
    enterpriseSession.request({
      url: `${app.globalData.baseUrl}/electricians/search-by-workno`,
      method: 'GET',
      data: { workNo },
      success: (res) => {
        if (this.workNoSearch !== search) return;
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
        if (this.workNoSearch !== search) return;
        this.setData({ searchingElectrician: false, searchEmpty: true });
        wx.showToast({ title: '搜索失败，请重试', icon: 'none' });
      }
    });
  },

  onServiceModeChange(e) {
    if (this._createdOrderId) { wx.showToast({ title: '请在已生成的原订单中处理', icon: 'none' }); return; }
    this.setData({ serviceMode: e.detail.value });
    this.updateSubmitEnable();
  },

  onEnterpriseCertChange(e) {
    const value = certOptions.serialize(e.detail.value);
    this.setData({ requiredCertType: value, enterpriseLowChecked: value.split(',').includes('low_voltage'), enterpriseHighChecked: value.split(',').includes('high_voltage'), enterpriseConstructionChecked: value.split(',').includes('construction') });
    this.updateSubmitEnable();
  },

  onRequiredCertChange(e) { this.setData({ requiredCertType: e.detail.value }); this.updateSubmitEnable(); },

  confirmPersonalPrepay(e) {
    if (!this._current() || !this._visible || !this._createdOrderId || this._leavingForPay) return;
    this._leavingForPay = true;
    const choice = this.data.createdEnterpriseOnsite
      ? { enterpriseOnsite: true, amount: this.data.createdPrepayAmount }
      : (e?.detail?.mode ? e.detail : undefined);
    personalOrder.grant(getApp(), this._createdOrderId, choice);
    wx.redirectTo({ url: `/pages/payment/payment/payment?orderId=${this._createdOrderId}`, fail: () => {
      personalOrder.clear(); this._leavingForPay = false; this.setData({ showPrepay: false }, () => this.setData({ showPrepay: true }));
    } });
  },

  closePersonalPrepay() {
    if (!this._current() || !this._createdOrderId) return;
    this.setData({ showPrepay: false });
    wx.redirectTo({ url: `/pages/order/detail/detail?id=${this._createdOrderId}` });
  },

  validateForm() {
    if (!supportsServiceMode(this.data) || !certOptions.parse(this.data.requiredCertType, this.data.userType === 'enterprise').length) {
      wx.showToast({ title: supportsServiceMode(this.data) ? '请选择所需资质' : '企业多人不上门服务暂未开放', icon: 'none' });
      return false;
    }
    if (!this._current() || this.data.submissionUncertain) {
      wx.showToast({ title: '请先在我的订单核对上次提交结果', icon: 'none' });
      return false;
    }
    if (!this.data.selectedServiceTypeId) {
      wx.showToast({ title: '请选择服务类型', icon: 'none' });
      return false;
    }
    if (!this.data.description || !this.data.description.trim()) {
      wx.showToast({ title: '请描述问题详情', icon: 'none' });
      return false;
    }
    if (!this.data.isDirected && !this._addressUsable(this.data.selectedAddress)) {
      wx.showToast({ title: '请选择服务地址', icon: 'none' });
      return false;
    }
    if (this.data.isDirected && !this.data.searchedElectrician) {
      wx.showToast({ title: '请搜索并选择电工', icon: 'none' });
      return false;
    }
    if (this.data.userType === 'user' && !this.data.electricityType) {
      wx.showToast({ title: '请选择用电类型', icon: 'none' });
      return false;
    }
    if (this.data.contactPhone && !/^1[3-9]\d{9}$/.test(this.data.contactPhone)) {
      wx.showToast({ title: '联系人手机号格式不正确', icon: 'none' });
      return false;
    }
    return true;
  },

  uploadImage(filePath) {
    return new Promise((resolve, reject) => {
      const app = getApp();
      enterpriseSession.uploadFile({
        url: `${app.globalData.baseUrl}/upload/order`,
        filePath,
        name: 'order_image',
        header: { 'Authorization': `Bearer ${app.globalData.token}` },
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
    if (!this.validateForm() || (this.data.orderMode === 'project' && !this.validateProjectForm())) return;
    if (this.data.submitting || this._createdOrderId) return;
    this.setData({ submitting: true });
    const app = getApp();

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

    if (!this._current() || this._visible === false) { this.setData({ submitting: false }); return; }
    const enterprise = this.data.userType === 'enterprise';
    const project = enterprise && this.data.orderMode === 'project';
    const payload = {
      ...(project ? { addressId: this.data.selectedAddress.id, projRequiredCount: this.data.enterpriseCount, projStartDate: this.data.projStartDate, projEndDate: this.data.projEndDate, ...(this.data.serviceMode === 'off_site' ? { project_price_selection:true, request_key: this._projectRequestKey ||= 'project_' + Date.now().toString(36) + Math.random().toString(36).slice(2) } : {projTotalAmount:this.data.projTotalAmount}), contactPhone: this.data.contactPhone } : {}),
      service_type_id: this.data.selectedServiceType.id,
      title: this.data.serviceMode === 'off_site' ? '不上门服务 技术服务与加工' : '上门服务 维修维护与安装',
      service_mode: this.data.serviceMode,
      ...(this.data.serviceMode === 'off_site' ? { pricing_mode: 'fixed_deposit' } : {}),
      required_cert_type: this.data.requiredCertType,
      description: this.data.description || '',
      contact_name: this.data.contactName || '', contact_phone: this.data.contactPhone || '',
      service_address: this.data.isDirected ? '' : this.data.selectedAddressStr,
      latitude: this.data.isDirected ? null : this.data.latitude, longitude: this.data.isDirected ? null : this.data.longitude,
      address_id: this.data.isDirected ? null : (this.data.selectedAddress?.id || null),
      images: imageUrls,
      ...(this.data.userType === 'user' ? { electricity_type: this.data.electricityType } : {}),
      isDirected: this.data.isDirected,
      electricianId: this.data.isDirected ? (this.data.searchedElectrician?.id || null) : null,
      // 推荐达人追踪：从缓存读取 referrer_id，当次会话有效
      referrerId: this._referrerId || wx.getStorageSync('referrer_id') || null
    };



    enterpriseSession.request({
      url: `${app.globalData.baseUrl}${project ? '/miniprogram/enterprise/orders/project' : '/orders'}`,
      method: 'POST',
      header: { 'Authorization': `Bearer ${app.globalData.token}`, 'Content-Type': 'application/json' },
      data: payload,
      success: (res) => {
        if (!this._current()) return;
        if (this.handleReturnedProfile(res?.data)) return;
        if (res && res.data && (res.statusCode === undefined || (res.statusCode >= 200 && res.statusCode < 300)) && res.data.success !== false && (res.data.code === 0 || res.data.code === 200)) {
          const orderId = res.data.data?.id || res.data.data?.orderId || res.data.id;
          const amount = Number(res.data.data?.prepay_amount);
          this._createdOrderId = orderId;
          if (!orderId || !Number.isFinite(amount) || amount <= 0) {
            this.setData({ submitting: false, submissionUncertain: true, canSubmit: false });
            wx.showToast({ title: '订单信息未确认，请查看我的订单', icon: 'none' });
            return;
          }
          this.setData({ createdOrderId: orderId, createdIsProject: project, createdEnterpriseOnsite: enterprise && !project && payload.service_mode === 'on_site', createdIsOffsite: payload.service_mode === 'off_site', createdPrepayAmount: amount.toFixed(2), createdProjectPrice: res.data.data?.project_billing || null, createdPricingMode:res.data.data?.pricing_mode || 'fixed_deposit', showPrepay: this._visible !== false, submitting: false, canSubmit: false });
        } else {
          if (res.statusCode >= 500 || res.data?.code >= 500) {
            this.setData({ submitting: false, submissionUncertain: true, canSubmit: false });
            wx.showToast({ title: '结果未确认，请先查看我的订单', icon: 'none' });
            return;
          }
          this.setData({ submitting: false });
          wx.showToast({ title: res.data?.message || '提交失败', icon: 'none' });
        }
      },
      fail: (err) => {
        if (!this._current()) return;
        this.setData({ submitting: false, submissionUncertain: true, canSubmit: false });
        console.error('提交订单失败：', err);
        wx.showToast({ title: '结果未确认，请先查看我的订单', icon: 'none' });
      }
    });
  },

  updateSubmitEnable() {
    if (this.data.orderMode === 'project') { this.updateProjectSubmitEnable(); return; }
    const ok = !!this.data.selectedServiceTypeId && supportsServiceMode(this.data)
      && certOptions.parse(this.data.requiredCertType, this.data.userType === 'enterprise').length > 0
      && !!this.data.description?.trim() && this._addressUsable(this.data.selectedAddress)
      && (this.data.userType !== 'user' || !!this.data.electricityType)
      && !this._createdOrderId && !this.data.submissionUncertain;
    this.setData({ canSubmit: !!ok });
  },

  // ─── 企业多日工程 ────────────────────────────────────────────

  // 资料打回只限制新建订单，不清除登录态。
  handleReturnedProfile(body) {
    if (this._createdOrderId || !this._current() || !['ENTERPRISE_PROFILE_RETURNED', 'ENTERPRISE_CERTIFICATION_REQUIRED'].includes(body?.data?.reason)) return false;
    if (this._visible === false) return true;
    if (this._certRedirectPending) return true;
    this._certRedirectPending = true;
    this.setData({ submitting: false, projectSubmitting: false });
    const returned = body.data.reason === 'ENTERPRISE_PROFILE_RETURNED';
    wx.showModal({ title: returned ? '企业资料需重新提交' : '请先完善企业资料',
      content: returned ? `${body.data.returnReason || '企业资料已被打回'}。请前往企业认证页重新提交，通过后可继续下单。` : '请先提交完整企业资料，通过后继续本次下单。',
      confirmText: '前往认证', cancelText: '暂不处理', confirmColor: '#16835c',
      success: result => {
        if (!this._current() || this._visible === false) return;
        if (result.confirm) {
          const entry = orderEntry.begin(getApp());
          wx.reLaunch({ url: `/pages/enterprise/certification/certification?orderEntry=${entry}` });
        }
      }, complete: () => { this._certRedirectPending = false; } });
    return true;
  },

  // 加载企业认证信息（用于区校验及打回提示）。
  loadEnterpriseCert() {
    const app = getApp();
    const generation = this._certQueryGeneration = (this._certQueryGeneration || 0) + 1;
    enterpriseSession.request({
      url: `${app.globalData.baseUrl}/miniprogram/enterprise/certification`,
      method: 'GET',
      header: { 'Authorization': `Bearer ${app.globalData.token}` },
      success: (res) => {
        if (!this._current() || this._visible === false || generation !== this._certQueryGeneration) return;
        if (this._createdOrderId) return;
        if (res?.data?.data?.certStatus === 'returned') {
          this.handleReturnedProfile({ data: { reason: 'ENTERPRISE_PROFILE_RETURNED', returnReason: res.data.data.returnReason } });
          return;
        }
        const ok = res?.data?.success === true || res?.data?.code === 0 || res?.data?.code === 200;
        if (ok && res.data.data?.certStatus !== 'approved') {
          this.handleReturnedProfile({ data: { reason: 'ENTERPRISE_CERTIFICATION_REQUIRED' } });
          return;
        }
        if (ok && res.data.data && res.data.data.certStatus === 'approved') {
          if (!this._current()) return;
          this.setData({ enterpriseCertDistrict: res.data.data.district || '' });
          if (this.data.selectedAddress) this._applyAddress(this.data.selectedAddress);
          this.updateAddressSubmit();
        }
      }
    });
  },

  onEnterpriseCountChange(e) {
    if (!this._current() || this.data.userType !== 'enterprise' || this.data.submitting || this._createdOrderId || this.data.submissionUncertain) return;
    const count = this.data.enterpriseCountRange[Number(e.detail.value)];
    if (!count) return;
    this.setData({ enterpriseCount: count, orderMode: count > 1 ? 'project' : 'quick', projectDateConfirmed: false,
      projectDateSummary: '', ...(count === 1 ? { projStartDate: '', projEndDate: '', projTotalAmount: '', projElectricianFee: '' } : {}) });
    this.calcElectricianFee();
    this.updateSubmitEnable();
  },
  // 兼容已有页面内部调用；页面不再提供旧模式切换。
  switchOrderMode(e) { this.onEnterpriseCountChange({ detail: { value: e.currentTarget.dataset.mode === 'project' ? 1 : 0 } }); },
  openProjectDates() {
    if (this.data.enterpriseCount < 2 || this.data.submitting || this._createdOrderId || this.data.submissionUncertain) return;
    this.setData({ showProjectDates: true, draftStartDate: this.data.projStartDate || '', draftEndDate: this.data.projEndDate || '',
      draftStartLabel: projectOrder.label(this.data.projStartDate), draftEndLabel: projectOrder.label(this.data.projEndDate), projectDateError: '', minProjectDate: projectOrder.today() });
  },
  onProjectDraftDate(e) {
    const field = e.currentTarget.dataset.field;
    if (!['draftStartDate', 'draftEndDate'].includes(field)) return;
    this.setData({ [field]: e.detail.value, [field === 'draftStartDate' ? 'draftStartLabel' : 'draftEndLabel']: projectOrder.label(e.detail.value), projectDateError: '' });
  },
  cancelProjectDates() {
    if (this.data.submitting || this._createdOrderId || this.data.submissionUncertain) return;
    this.setData({ showProjectDates: false });
    this.onEnterpriseCountChange({ detail: { value: 0 } });
  },
  confirmProjectDates() {
    if (!this.data.showProjectDates || this.data.enterpriseCount < 2) return;
    const { draftStartDate: start, draftEndDate: end } = this.data;
    if (!projectOrder.allowed(start, end)) { this.setData({ projectDateError: '请选择当天或未来日期，包含首尾共2至29天' }); return; }
    this.setData({ showProjectDates: false, projStartDate: start, projEndDate: end, projectDateConfirmed: true,
      projectDateSummary: `${projectOrder.label(start)} 至 ${projectOrder.label(end)}（共${projectOrder.days(start, end)}天）` });
    this.updateSubmitEnable();
  },
  onProjAmountInput(e) {
    this.setData({ projTotalAmount: e.detail.value });
    this.calcElectricianFee(); this.updateSubmitEnable();
  },
  calcElectricianFee() {
    const amount = this.data.projTotalAmount, count = this.data.enterpriseCount;
    this.setData({ projElectricianFee: projectOrder.money(amount) && count > 1 ? (Math.round(Math.round(Number(amount) * 100) * 85 / (count * 100)) / 100).toFixed(2) : '' });
  },
  updateProjectSubmitEnable() {
    const ok = this.data.userType === 'enterprise' && this.data.enterpriseCount > 1 && this.data.projectDateConfirmed
      && projectOrder.allowed(this.data.projStartDate, this.data.projEndDate) && (this.data.serviceMode === 'off_site' || projectOrder.money(this.data.projTotalAmount))
      && supportsServiceMode(this.data) && certOptions.parse(this.data.requiredCertType, this.data.userType === 'enterprise').length > 0
      && !!this.data.description?.trim() && this._addressUsable(this.data.selectedAddress)
      && !this._createdOrderId && !this.data.submissionUncertain;
    this.setData({ canSubmit: !!ok });
  },
  validateProjectForm() {
    this.updateProjectSubmitEnable();
    if (!this.data.canSubmit) wx.showToast({ title: '请确认人数日期、工程总费用和符合条件的地址', icon: 'none' });
    return this.data.canSubmit;
  },
  submitProjectOrder() { return this.submitOrder(); }
});
