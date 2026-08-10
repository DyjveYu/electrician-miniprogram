// pages/order/create/create.js
const plugin = requirePlugin('WechatSI')
const manager = plugin.getRecordRecognitionManager()
const SERVICE_TYPES = require('../../../config/service-types')

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
    projRequiredCount: 2,
    projRequiredRange: Array.from({ length: 29 }, (_, i) => i + 2), // 2-30
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

  onLoad() {
    const app = getApp();
    if (!app.globalData.token || !app.globalData.userInfo) {
      wx.showToast({ title: '请先登录', icon: 'none', duration: 1500 });
      setTimeout(() => { wx.reLaunch({ url: '/pages/login/login' }); }, 1500);
      return;
    }
    // 检查用户类型
    const userType = app.globalData.currentRole || 'user';
    this.setData({ userType });
    // 企业用户加载认证信息（用于区校验）
    if (userType === 'enterprise') {
      this.loadEnterpriseCert();
    }
    this.loadServiceTypes();
    this.getUserInfo();
    this._initVoice();
  },

  onShow() {
    const app = getApp();
    if (app.checkFrozenAndRedirect()) return;
    if (this.data.showAddressSheet) this.loadAddresses();
  },

  onUnload() {
    clearInterval(this._waveTimer);
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
    wx.request({
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
    if (!this.validateForm()) return;
    if (this.data.submitting) return;
    // 未阅读协议时弹出协议弹层
    if (!this.data.hasOpenedAgreement) {
      this.setData({ showAgreementModal: true, hasOpenedAgreement: true });
      return;
    }
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
      // 推荐达人追踪：从缓存读取 referrer_id，当次会话有效
      referrerId: wx.getStorageSync('referrer_id') || null
    };

    console.log('提交的订单 payload:', payload);

    wx.request({
      url: `${app.globalData.baseUrl}/orders`,
      method: 'POST',
      header: { 'Authorization': `Bearer ${app.globalData.token}`, 'Content-Type': 'application/json' },
      data: payload,
      success: (res) => {
        this.setData({ submitting: false });
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
  },

  updateSubmitEnable() {
    let ok = !!this.data.selectedServiceTypeId
      && !!(this.data.description && this.data.description.trim())
      && !!this.data.agreePrepayTerms
      && !!this.data.hasOpenedAgreement;
    if (this.data.isDirected) {
      ok = ok && !!this.data.searchedElectrician;
    } else {
      ok = ok && !!this.data.selectedAddressStr;
    }
    this.setData({ canSubmit: ok });
  },

  // ─── 企业多日工程 ────────────────────────────────────────────

  // 加载企业认证信息（用于区校验）
  loadEnterpriseCert() {
    const app = getApp();
    wx.request({
      url: `${app.globalData.baseUrl}/miniprogram/enterprise/certification`,
      method: 'GET',
      header: { 'Authorization': `Bearer ${app.globalData.token}` },
      success: (res) => {
        const ok = res?.data?.success === true || res?.data?.code === 0 || res?.data?.code === 200;
        if (ok && res.data.data && res.data.data.certStatus === 'approved') {
          this.setData({ enterpriseCertDistrict: res.data.data.district || '' });
        }
      }
    });
  },

  // 切换下单模式
  switchOrderMode(e) {
    const mode = e.currentTarget.dataset.mode;
    this.setData({ orderMode: mode });
    this.updateProjectSubmitEnable();
  },

  // 多日工程 - 电工人数变更
  onProjCountChange(e) {
    const idx = e.detail.value;
    const count = this.data.projRequiredRange[idx];
    this.setData({ projRequiredCount: count });
    this.calcElectricianFee();
    this.updateProjectSubmitEnable();
  },

  // 多日工程 - 日期变更
  onProjDateChange(e) {
    const { field } = e.currentTarget.dataset;
    const val = e.detail.value;
    this.setData({ [field]: val });
    this.updateProjectSubmitEnable();
  },

  // 多日工程 - 持证要求变更（多选）
  onProjCertChange(e) {
    const values = e.detail.value || [];
    this.setData({
      projCertLowChecked: values.includes('low_voltage'),
      projCertHighChecked: values.includes('high_voltage')
    });
    this.updateProjectSubmitEnable();
  },

  // 多日工程 - 总费用变更
  onProjAmountInput(e) {
    this.setData({ projTotalAmount: e.detail.value });
    this.calcElectricianFee();
    this.updateProjectSubmitEnable();
  },

  // 多日工程 - 省市区变更
  onProjectRegionChange(e) {
    this.setData({ projectRegion: e.detail.value });
    this.updateProjectSubmitEnable();
  },

  // 多日工程 - 详细地址变更
  onProjectAddressInput(e) {
    this.setData({ projectAddressDetail: e.detail.value });
    this.updateProjectSubmitEnable();
  },

  // 计算每个电工应得金额
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

  // 多日工程 - 更新提交按钮状态
  updateProjectSubmitEnable() {
    const { projStartDate, projStartTime, projEndDate, projEndTime, projTotalAmount, projectRegion, projectAddressDetail } = this.data;
    const ok = projStartDate && projStartTime && projEndDate && projEndTime
      && parseFloat(projTotalAmount) > 0
      && projectRegion[0] && projectRegion[1] && projectRegion[2]
      && projectAddressDetail && projectAddressDetail.trim();
    this.setData({ canSubmit: ok });
  },

  // 多日工程 - 表单校验
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

    // 区级校验：必须与企业认证地址的区一致
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

  // 多日工程 - 提交
  async submitProjectOrder() {
    if (!this.validateProjectForm()) return;
    if (this.data.projectSubmitting) return;
    this.setData({ projectSubmitting: true });

    const app = getApp();
    const { description, projRequiredCount, projStartDate, projStartTime,
            projEndDate, projEndTime, projCertLowChecked, projCertHighChecked,
            projTotalAmount, contactPhone, projectRegion, projectAddressDetail } = this.data;

    // 构建持证要求：逗号分隔
    const certReqs = [];
    if (projCertLowChecked) certReqs.push('low_voltage');
    if (projCertHighChecked) certReqs.push('high_voltage');
    const projCertRequirement = certReqs.join(',');

    // 构建完整 datetime
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
      addressDetail: projectAddressDetail
    };

    wx.request({
      url: `${app.globalData.baseUrl}/miniprogram/enterprise/orders/project`,
      method: 'POST',
      header: { 'Authorization': `Bearer ${app.globalData.token}`, 'Content-Type': 'application/json' },
      data: payload,
      success: (res) => {
        this.setData({ projectSubmitting: false });
        if (res && res.data && (res.data.code === 0 || res.data.code === 200)) {
          wx.showToast({ title: '创建成功，跳转支付', icon: 'none' });
          const orderId = res.data.data?.orderId || res.data.data?.id;
          setTimeout(() => {
            wx.navigateTo({ url: `/pages/payment/payment/payment?orderId=${orderId}` });
          }, 500);
        } else {
          wx.showToast({ title: res.data?.message || '提交失败', icon: 'none' });
        }
      },
      fail: (err) => {
        this.setData({ projectSubmitting: false });
        console.error('提交多日工程失败：', err);
        wx.showToast({ title: '网络错误，请重试', icon: 'none' });
      }
    });
  }
});
