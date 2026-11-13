// pages/profile/certification/certification.js
const licenseTypes = [
  { license_type: 'low_voltage', label: '低压电工' },
  { license_type: 'high_voltage', label: '高压电工' },
  { license_type: 'construction', label: '建筑电工' }
];

function currentMonth() {
  return new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 7);
}

Page({
  data: {
    editing: false,
    mode: 'apply', // apply: 申请认证, view: 查看认证
    workTypes: ['maintenance'], // 默认选中维修电工
    isMaintenanceChecked: true, // 维修电工是否选中
    isInstallationChecked: false, // 安装电工是否选中
    formData: {
      realName: '',
      idCard: '',
      phone: '',
      serviceArea: '',
    },
    certificationStatus: '', // pending: 审核中, approved: 已通过, rejected: 已拒绝
    regionChangePending: false,
    regionInfo: null,
    regionInfoLoading: false,
    regionInfoError: '',
    regionEditorOpen: false,
    targetRegion: ['', '', ''],
    regionChangeReason: '',
    targetRegionFees: [],
    targetRegionError: '',
    targetRegionChecking: false,
    rejectReason: '',
    submitDisabled: true,
    region: ['', '', ''],
    customItem: '全部',
    idCardFrontPath: '',
    idCardBackPath: '',
    idCardDraft: null,
    idCardUpdateMatches: false,
    savedIdCard: {},
    steps: ['基本信息', '业务信息', '接单区域', '工费信息'],
    activeStep: 0,
    unlockedStep: 0,
    hourlyRate: '',
    dailyRate: '',
    calloutFees: [],
    calloutFeesUnavailable: false,
    checkingRegion: false,
    certificationLoaded: false,
    certificationLoading: false,
    certificationLoadError: '',
    licenses: [],
    licenseOptions: licenseTypes,
    careerMonth: '',
    careerLabel: '',
    careerYears: null,
    careerError: '',
    currentMonth: currentMonth(),
    businessValid: false,
    businessRevision: 0,
    sameIdentity: false,
    reapply: false,
    submitting: false,
    noticeAgreed: false
  },

  parseServiceAreaToRegion(serviceArea) {
    if (!serviceArea) return ['', '', ''];
    const s = String(serviceArea).trim();
    if (!s) return ['', '', ''];

    const splitByDelimiters = (str) => {
      const parts = str
        .split(/[,\s/|-]+/g)
        .map(v => String(v || '').trim())
        .filter(Boolean);
      if (parts.length >= 3) return [parts[0], parts[1], parts[2]];
      if (parts.length === 2) return [parts[0], parts[1], ''];
      if (parts.length === 1) return [parts[0], '', ''];
      return ['', '', ''];
    };

    if (/[,\s/|-]/.test(s)) {
      return splitByDelimiters(s);
    }

    const m = s.match(/^(.*?(?:省|自治区|特别行政区))(.*?(?:市|自治州|地区|盟))(.*)$/);
    if (m) {
      return [m[1] || '', m[2] || '', m[3] || ''];
    }

    const m2 = s.match(/^(.*?市)(.*?区|.*?县|.*?市)(.*)$/);
    if (m2) {
      return [m2[1] || '', m2[2] || '', m2[3] || ''];
    }

    return [s, '', ''];
  },

  onLoad(options) {
    const { token, userInfo } = getApp().globalData;
    this.session = { token, userId: userInfo?.id };
    this.notificationStep = options.step === '2';
    this.notificationRegionChangeId = /^\d+$/.test(options.regionChangeId || '') ? options.regionChangeId : '';
    // 设置页面模式：申请认证或查看认证
    if (options.mode) {
      this.setData({ mode: options.mode });
    }

    // 电工认证页手机号使用注册手机号且不可修改
    const app = getApp();
    if (app.globalData.userInfo && app.globalData.userInfo.phone) {
      this.setData({
        'formData.phone': app.globalData.userInfo.phone
      });
    }

    this.loadCertificationInfo();
  },

  onUnload() {
    this.closed = true;
  },

  isCurrent() {
    const { token, userInfo } = getApp().globalData;
    return !this.closed && this.session.token === token && this.session.userId === userInfo?.id;
  },

  // 加载认证信息
  loadCertificationInfo() {
    if (!this.isCurrent() || this.data.certificationLoading) return;
    const app = getApp();
    this.regionInfoRequest = null;
    this.setData({ regionInfo: null, regionInfoLoading: false });
    this.setData({ certificationLoaded: false, certificationLoading: true, certificationLoadError: '' });
    wx.showLoading({
      title: '加载中',
    });

    wx.request({
      url: `${app.globalData.baseUrl}/electricians/certification/status`,
      method: 'GET',
      header: {
        'Authorization': `Bearer ${app.globalData.token}`
      },
      success: (res) => {
        if (!this.isCurrent()) return;
        const ok = res.statusCode >= 200 && res.statusCode < 300
          && (res?.data?.success === true || res?.data?.code === 0 || res?.data?.code === 200);
        if (ok) {
          const data = res?.data?.data || {};
          // 兼容两种返回结构：{ certification } 或直接返回认证实体 / { status: 'none' }
          const cert = data.certification || (data.user_id || data.status ? data : null);
          const status = (data.status || cert?.status || 'none');
          const workTypes = cert?.work_types ? String(cert.work_types).split(',') : this.data.workTypes;
          const region = cert?.region
            ? String(cert.region).split(',')
            : (cert?.service_area ? this.parseServiceAreaToRegion(cert.service_area) : this.data.region);
          const serviceArea = cert?.service_area || (Array.isArray(region) ? region.join('') : '') || this.data.formData.serviceArea;
          this.setData({
            mode: status === 'none' ? 'apply' : 'view',
            activeStep: this.notificationStep && status !== 'none' ? 2 : this.data.activeStep,
            workTypes,
            isMaintenanceChecked: workTypes.includes('maintenance'),
            isInstallationChecked: workTypes.includes('installation'),
            formData: {
              realName: cert?.real_name || this.data.formData.realName,
              idCard: cert?.id_card || this.data.formData.idCard,
              phone: app.globalData.userInfo?.phone || '',
              serviceArea,
            },
            certificationStatus: status,
            regionChangePending: !!cert?.region_change_pending_id,
            certificationLoaded: true,
            savedIdCard: {
              age: cert?.id_card_age ?? null,
              gender: cert?.id_card_gender || '',
              expiresOn: cert?.id_card_expires_on || '',
              longTerm: cert?.id_card_is_long_term === true
            },
            idCardDraft: null,
            rejectReason: cert?.reject_reason || '',
            // 加载省市区信息
            region: [
              cert?.province || region[0] || '',
              cert?.city || region[1] || '',
              cert?.district || region[2] || ''
            ],
            idCardFrontPath: cert?.id_card_front || '',
            idCardBackPath: cert?.id_card_back || '',
            licenses: cert?.licenses || [],
            licenseOptions: licenseTypes.map(type => ({ ...type, checked: !!cert?.licenses?.some(row => row.license_type === type.license_type) })),
            careerMonth: cert?.career_started_month || '',
            careerYears: cert?.career_years ?? null,
            businessRevision: cert?.business_revision ?? 0,
            sameIdentity: cert?.license_invalidated_after_approval === true || cert?.legacy_identity_locked === true,
            hourlyRate: cert?.hourly_rate == null ? '' : String(cert.hourly_rate),
            dailyRate: cert?.daily_rate == null ? '' : String(cert.daily_rate),
            calloutFees: cert?.callout_fees || [],
            calloutFeesUnavailable: cert?.callout_fees_unavailable === true,
            reapply: false
          }, () => {
            this.editSnapshot = null;
            this.setData({ editing: false });
            if (status === 'approved') this.startEditing();
            this.checkFormValid();
            this.loadLicenseThumbnails();
            if (this.data.activeStep === 2 || cert?.region_change_pending_id) this.loadRegionChangeStatus();
          });
        } else {
          this.setData({ certificationLoadError: res?.data?.message || '认证资料加载失败，请重试' });
        }
      },
      fail: () => {
        if (!this.isCurrent()) return;
        this.setData({ certificationLoadError: '无法连接认证服务，请检查网络后重试' });
      },
      complete: () => {
        if (this.isCurrent()) this.setData({ certificationLoading: false });
        wx.hideLoading();
      }
    });
  },

  // 工作类型多选处理
  onWorkTypesChange(e) {
    this.invalidateFrom(1);
    const values = e.detail.value; // 获取选中的值数组

    this.setData({
      workTypes: values,
      isMaintenanceChecked: values.includes('maintenance'),
      isInstallationChecked: values.includes('installation')
    });

    this.checkFormValid();
  },

  // 认证须知勾选处理
  onNoticeAgreementChange(e) {
    const values = e.detail.value;
    this.setData({
      noticeAgreed: values.includes('agreed')
    });

    this.checkFormValid();
  },

  // 跳转至认证须知详情页
  goToCertificationNotice() {
    wx.navigateTo({
      url: '/pages/profile/certification/notice/notice'
    });
  },

  // 地区选择器变更
  bindRegionChange(e) {
    this.applyRegion(e.detail.value);
  },

  applyRegion(region) {
    if (!this.isCurrent() || this.data.mode !== 'apply' || this.data.submitting) return;
    if (region.join(',') === this.data.region.join(',')) return;
    this.regionRequest = null;
    this.invalidateFrom(2);
    this.setData({
      region, 'formData.serviceArea': region.join(''), calloutFees: [], checkingRegion: false
    });
  },

  // 获取当前位置
  getLocation() {
    if (this.data.mode === 'view' && this.data.certificationStatus !== 'approved') {
      wx.showToast({ title: '认证中不可修改', icon: 'none' });
      return;
    }
    wx.showLoading({
      title: '获取位置中',
    });

    wx.getLocation({
      type: 'gcj02',
      success: (res) => {
        // 使用坐标反查地址信息
        wx.request({
          url: `https://apis.map.qq.com/ws/geocoder/v1/?location=${res.latitude},${res.longitude}&key=YOUR_MAP_KEY`,
          success: (locationRes) => {
            if (locationRes.data && locationRes.data.result) {
              const addressInfo = locationRes.data.result.address_component;
              const region = [
                addressInfo.province || '',
                addressInfo.city || '',
                addressInfo.district || ''
              ];

              this.applyRegion(region);
            }
          },
          complete: () => {
            wx.hideLoading();
          }
        });
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({
          title: '获取位置失败',
          icon: 'none'
        });
      }
    });
  },

  // 跳转至身份证上传页面
  navigateToIdentity() {
    if (!this.isCurrent() || this.data.submitting) return;
    if (!this.data.certificationLoaded) {
      if (!this.data.certificationLoading) this.loadCertificationInfo();
      return;
    }
    if (this.data.editing && JSON.stringify(this.editableValues()) !== this.editSnapshot?.comparison) {
      wx.showToast({ title: '请先提交或取消资料修改，再更新身份证', icon: 'none' });
      return;
    }
    const readOnly = this.data.mode === 'view' && this.data.certificationStatus !== 'approved';
    wx.navigateTo({
      url: '/pages/profile/certification/identity/identity',
      events: {
        acceptDataFromIdentityPage: data => {
          if (!this.isCurrent() || readOnly) return;
          this.invalidateFrom(0);
          const { realName, idCard } = this.data.formData;
          const fields = {
            idCardDraft: data,
            idCardUpdateMatches: data.name === realName && data.id === idCard.toUpperCase(),
            activeStep: 0
          };
          if (this.data.certificationStatus === 'approved') {
            fields.editing = false;
            this.editSnapshot = null;
            wx.disableAlertBeforeUnload?.();
          }
          this.setData(fields, () => this.checkFormValid());
        }
      },
      success: res => {
        const draft = this.data.idCardDraft;
        res.eventChannel.emit('acceptDataFromOpenerPage', {
          readOnly,
          idCardFront: draft?.idCardFront || this.data.idCardFrontPath,
          idCardBack: draft?.idCardBack || this.data.idCardBackPath
        });
      }
    });
  },

  invalidateFrom(step) {
    if (this.data.mode === 'apply' && this.data.unlockedStep > step) {
      this.setData({ unlockedStep: step });
    }
  },

  selectStep(e) {
    const step = Number(e.currentTarget.dataset.step);
    if (!Number.isInteger(step) || step < 0 || step >= this.data.steps.length || this.data.submitting) return;
    if (this.data.mode === 'apply' && step > this.data.unlockedStep) return;
    this.setData({ activeStep: step });
    if (step === 2 && this.data.mode === 'view') this.loadRegionChangeStatus();
  },

  unlockStep(step) {
    this.setData({ activeStep: step, unlockedStep: Math.max(step, this.data.unlockedStep) });
  },

  nextCertificationStep() {
    if (!this.data.certificationLoaded || this.data.mode !== 'apply' || this.data.activeStep !== 0 || this.data.submitting) return;
    const { idCardDraft, sameIdentity, savedIdCard, formData } = this.data;
    const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
    const savedValid = sameIdentity && (savedIdCard.longTerm || (savedIdCard.expiresOn && savedIdCard.expiresOn >= today));
    if ((!idCardDraft && !savedValid) || (sameIdentity && idCardDraft && !this.data.idCardUpdateMatches)) {
      wx.showToast({ title: '请上传与本人认证资料一致的有效身份证', icon: 'none' });
      return;
    }
    if (!/^1[3-9]\d{9}$/.test(formData.phone)) {
      wx.showToast({ title: '请核对登录手机号', icon: 'none' });
      return;
    }
    this.unlockStep(1);
  },

  cancelIdCardUpdate() {
    if (!this.data.submitting) this.setData({ idCardDraft: null }, () => this.startEditing());
  },

  saveIdCardUpdate() {
    const { idCardDraft, idCardUpdateMatches, certificationStatus, mode, submitting } = this.data;
    if (submitting || !idCardDraft || !idCardUpdateMatches || certificationStatus !== 'approved'
        || mode !== 'view' || !this.isCurrent()) return;

    const { baseUrl } = getApp().globalData;
    this.setData({ submitting: true });
    wx.request({
      url: `${baseUrl}/electricians/certification/id-card`,
      method: 'PUT',
      header: { Authorization: `Bearer ${this.session.token}` },
      data: { id_card_draft: idCardDraft.draftId },
      success: res => {
        if (!this.isCurrent()) return;
        const cert = res.data?.data;
        if (res.data?.success !== true || !cert) {
          wx.showModal({ title: '保存失败', content: res.data?.message || '请稍后重试', showCancel: false });
          return;
        }
        this.setData({
          idCardDraft: null,
          businessRevision: cert.business_revision,
          idCardFrontPath: cert.id_card_front,
          idCardBackPath: cert.id_card_back,
          savedIdCard: {
            age: cert.id_card_age ?? null,
            gender: cert.id_card_gender || '',
            expiresOn: cert.id_card_expires_on || '',
            longTerm: cert.id_card_is_long_term === true
          }
        }, () => this.startEditing());
        wx.showToast({ title: '身份证资料已更新', icon: 'success' });
      },
      fail: () => {
        if (this.isCurrent()) wx.showToast({ title: '保存失败，请重试', icon: 'none' });
      },
      complete: () => {
        if (this.isCurrent()) this.setData({ submitting: false }, () => this.startEditing());
      }
    });
  },

  selectLicenses(event) {
    if ((this.data.mode !== 'apply' && !this.data.editing) || this.data.submitting) return;
    this.photoSelectionRevision = (this.photoSelectionRevision || 0) + 1;
    const current = this.data.licenses;
    const selected = event.detail.value;
    this.invalidateFrom(1);
    const licenses = licenseTypes.filter(type => selected.includes(type.license_type))
      .map(type => current.find(item => item.license_type === type.license_type) || { ...type });
    this.setData({ licenses, licenseOptions: licenseTypes.map(type => ({
      ...type, checked: selected.includes(type.license_type)
    })) }, () => this.checkFormValid());
  },

  editLicense(event) {
    if ((this.data.mode !== 'apply' && !this.data.editing) || this.data.submitting) return;
    this.invalidateFrom(1);
    const { index, field } = event.currentTarget.dataset;
    this.setData({ [`licenses[${index}].${field}`]: event.detail.value }, () => this.checkFormValid());
  },

  chooseLicensePhoto(event) {
    const type = event.currentTarget.dataset.type;
    if ((this.data.mode !== 'apply' && !this.data.editing) || this.data.submitting) return;
    const editor = this.editSnapshot;
    const selection = (this.photoSelectionRevision || 0) + 1;
    this.photoSelectionRevision = selection;
    wx.chooseImage({ count: 1, sizeType: ['compressed'], sourceType: ['album', 'camera'],
      success: res => {
        const index = this.data.licenses.findIndex(row => row.license_type === type);
        if (!this.isCurrent() || this.data.submitting || index < 0 || editor !== this.editSnapshot
          || selection !== this.photoSelectionRevision
          || (this.data.mode !== 'apply' && !this.data.editing)) return;
        this.invalidateFrom(1);
        this.setData({ [`licenses[${index}].localPhoto`]: res.tempFilePaths[0] }, () => this.checkFormValid());
      }
    });
  },

  tapLicensePhoto(event) {
    if (this.data.mode === 'apply' || this.data.editing) {
      this.chooseLicensePhoto(event);
      return;
    }
    const { url } = event.currentTarget.dataset;
    this.resolveLicensePhoto(url, path => wx.previewImage({ urls: [path] }),
      () => wx.showToast({ title: '证书照片读取失败', icon: 'none' }));
  },

  loadLicenseThumbnails() {
    const request = (this.licenseThumbnailRequest || 0) + 1;
    this.licenseThumbnailRequest = request;
    for (const { license_type, photo_url } of this.data.licenses) {
      this.resolveLicensePhoto(photo_url, path => {
        if (request !== this.licenseThumbnailRequest) return;
        const index = this.data.licenses.findIndex(row => row.license_type === license_type && row.photo_url === photo_url);
        if (index >= 0) this.setData({ [`licenses[${index}].previewUrl`]: path });
      });
    }
  },

  resolveLicensePhoto(url, onSuccess, onFailure) {
    if (!url || !this.isCurrent()) return;
    const origin = getApp().globalData.baseUrl.replace(/\/api\/?$/, '');
    if (!url.startsWith('/api/')) {
      onSuccess(url.startsWith('/uploads/') ? origin + url : url);
      return;
    }
    wx.downloadFile({
      url: origin + url,
      header: { Authorization: `Bearer ${this.session.token}` },
      success: res => {
        if (!this.isCurrent()) return;
        if (res.statusCode === 200) onSuccess(res.tempFilePath);
        else onFailure?.();
      },
      fail: () => { if (this.isCurrent()) onFailure?.(); }
    });
  },

  editCareerMonth(event) {
    if ((this.data.mode !== 'apply' && !this.data.editing) || this.data.submitting) return;
    this.invalidateFrom(1);
    this.setData({ careerMonth: event.detail.value }, () => this.checkFormValid());
  },

  checkFormValid() {
    this.syncEditWarning();
    const { licenses, careerMonth, idCardDraft, sameIdentity, formData, workTypes, noticeAgreed } = this.data;
    const id = idCardDraft?.id || ((sameIdentity || this.data.editing) ? formData.idCard : '');
    const current = currentMonth();
    const birth = /^(?:[1-9]\d{5})(\d{4})(0[1-9]|1[0-2])\d{5}[\dXx]$/.exec(id);
    const earliest = birth ? `${Number(birth[1]) + 18}-${birth[2]}` : '';
    const monthValid = !!(earliest && careerMonth && careerMonth >= earliest && careerMonth <= current);
    const years = monthValid
      ? Number(current.slice(0, 4)) - Number(careerMonth.slice(0, 4)) - (current.slice(5) < careerMonth.slice(5) ? 1 : 0)
      : null;
    const certificateValid = licenses.length > 0 && licenses.every(item =>
      item.certificate_number?.trim() && item.start_date && item.end_date > item.start_date
      && (item.localPhoto || (item.photo_url && !item.legacy))
    );
    const businessValid = !!(certificateValid && monthValid && workTypes.length);
    this.setData({
      currentMonth: current,
      careerLabel: careerMonth ? `${careerMonth.slice(0, 4)} 年 ${careerMonth.slice(5, 7)} 月` : '',
      careerYears: this.data.mode === 'view' && !this.data.editing ? this.data.careerYears : years,
      careerError: (this.data.mode === 'apply' || this.data.editing) && careerMonth && !monthValid
        ? (earliest ? '请选择满18周岁至当前月份之间的年月' : '无法确认出生年月，请核对身份证资料') : '',
      businessValid,
      submitDisabled: !(businessValid && noticeAgreed && this.data.calloutFees.length === 3
        && this.validRate(this.data.hourlyRate, 18.2, 1000) && this.validRate(this.data.dailyRate, 145.6, 8000))
    });
  },

  nextRegionStep() {
    if (this.data.mode !== 'apply' || this.data.activeStep !== 1 || this.data.submitting) return;
    if (this.data.businessValid) {
      this.unlockStep(2);
    } else {
      wx.showToast({ title: this.data.careerError || '请补全证书和从业年月', icon: 'none' });
    }
  },

  nextFeeStep() {
    if (!this.isCurrent() || this.data.mode !== 'apply' || this.data.activeStep !== 2 || this.data.checkingRegion || this.data.submitting) return;
    const [province, city, district] = this.data.region;
    if ([province, city, district].some(value => !value || value === '全部')) {
      wx.showToast({ title: '请选择完整的接单区域', icon: 'none' });
      return;
    }
    if ([province, city, district].some(value => /香港|澳门|台湾/.test(value))) {
      wx.showToast({ title: '目前香港、澳门、台湾业务未开通', icon: 'none' });
      return;
    }
    const request = {};
    this.regionRequest = request;
    const isCurrent = () => this.isCurrent() && this.regionRequest === request;
    this.invalidateFrom(2);
    this.setData({ checkingRegion: true, calloutFees: [] }, () => this.checkFormValid());
    wx.request({
      url: `${getApp().globalData.baseUrl}/electricians/certification/region`,
      method: 'POST',
      header: { Authorization: `Bearer ${this.session.token}` },
      data: { province, city, district },
      success: res => {
        if (!isCurrent()) return;
        if (res.data?.success && res.data.data?.callout_fees?.length === 3) {
          this.setData({ calloutFees: res.data.data.callout_fees, calloutFeesUnavailable: false }, () => {
            if (this.data.activeStep === 2) this.unlockStep(3);
            this.checkFormValid();
          });
        } else {
          wx.showToast({ title: res.data?.message || '接单区域校验失败', icon: 'none' });
        }
      },
      fail: () => {
        if (!isCurrent()) return;
        wx.showToast({ title: '接单区域校验失败，请重试', icon: 'none' });
      },
      complete: () => { if (isCurrent()) this.setData({ checkingRegion: false }); }
    });
  },

  validRate(value, min, max) {
    return /^\d+(?:\.\d{1,2})?$/.test(value) && Number(value) >= min && Number(value) <= max;
  },

  editRate(e) {
    const field = e.currentTarget.dataset.field;
    if ((this.data.mode !== 'apply' && !this.data.editing) || this.data.submitting || !['hourlyRate', 'dailyRate'].includes(field)) return;
    this.setData({ [field]: e.detail.value }, () => this.checkFormValid());
  },

  openWageReference() {
    wx.navigateTo({ url: '/pages/profile/certification/notice/notice?type=wage' });
  },

  uploadLicensePhoto(filePath, type) {
    return new Promise((resolve, reject) => {
      wx.uploadFile({
        url: `${getApp().globalData.baseUrl}/electricians/certification/licenses/photo/${type}`,
        header: { Authorization: `Bearer ${this.session.token}` },
        name: 'image', filePath,
        success: response => {
          let body;
          try { body = JSON.parse(response.data); } catch {}
          if (response.statusCode === 200 && body?.data?.draft) resolve(body.data.draft);
          else reject(new Error(body?.message || '证书照片上传失败'));
        },
        fail: () => reject(new Error('证书照片上传失败'))
      });
    });
  },
  async submitCertification() {
    if (this.data.submitting || !this.isCurrent() || this.data.mode !== 'apply') return;
    this.checkFormValid();
    const { submitDisabled, activeStep, unlockedStep, region, licenses, reapply, idCardDraft,
      businessRevision, careerMonth, workTypes, hourlyRate, dailyRate } = this.data;
    if (submitDisabled || activeStep !== 3 || unlockedStep !== 3) {
      wx.showToast({ title: '请完善认证信息后再提交', icon: 'none' });
      return;
    }
    this.setData({ submitting: true });
    wx.showLoading({ title: '提交认证中', mask: true });
    try {
      const rows = [];
      for (const { license_type, certificate_number, start_date, end_date, localPhoto } of licenses) {
        const photo_draft = localPhoto ? await this.uploadLicensePhoto(localPhoto, license_type) : undefined;
        if (!this.isCurrent()) return;
        rows.push({ license_type, certificate_number, start_date, end_date, photo_draft });
      }
      const { baseUrl } = getApp().globalData;
      const result = await new Promise((resolve, reject) => wx.request({
        url: `${baseUrl}/electricians/certification${reapply ? '/reapply' : ''}`,
        method: reapply ? 'PUT' : 'POST',
        header: { Authorization: `Bearer ${this.session.token}` },
        data: {
          work_types: workTypes.join(','),
          province: region[0], city: region[1], district: region[2],
          id_card_draft: idCardDraft?.draftId, business_revision: businessRevision,
          career_started_month: careerMonth, licenses: rows,
          hourly_rate: Number(hourlyRate), daily_rate: Number(dailyRate)
        },
        success: res => {
          if (res.data?.success && res.data.data) resolve(res.data);
          else reject(new Error(res.data?.message || '提交失败'));
        },
        fail: () => reject(new Error('网络请求失败，请重试'))
      }));
      if (!this.isCurrent()) return;
      this.setData({
        mode: 'view', activeStep: 0, unlockedStep: 0, reapply: false,
        certificationStatus: result.data.status,
        rejectReason: result.data.reject_reason || '', idCardDraft: null
      });
      if (result.data.status === 'approved') wx.showToast({ title: '认证已通过', icon: 'success' });
      this.loadCertificationInfo();
    } catch (error) {
      if (this.isCurrent()) wx.showModal({ title: '提交失败', content: error.message, showCancel: false });
    } finally {
      if (this.isCurrent()) {
        wx.hideLoading();
        this.setData({ submitting: false });
      }
    }
  },

  editableValues() {
    const { licenses, careerMonth, hourlyRate, dailyRate } = this.data;
    return {
      licenses: licenses.map(row => ({
        license_type: row.license_type, certificate_number: row.certificate_number?.trim(),
        start_date: row.start_date, end_date: row.end_date,
        localPhoto: row.localPhoto || '', photo_url: row.photo_url || ''
      })),
      careerMonth, hourlyRate, dailyRate
    };
  },

  syncEditWarning() {
    if (!this.data.editing || !this.editSnapshot) return;
    const dirty = JSON.stringify(this.editableValues()) !== this.editSnapshot.comparison;
    if (dirty) wx.enableAlertBeforeUnload?.({ message: '资料修改尚未保存，确定离开？' });
    else wx.disableAlertBeforeUnload?.();
  },

  startEditing() {
    if (!this.isCurrent() || !this.data.certificationLoaded || this.data.certificationStatus !== 'approved'
      || this.data.editing || this.data.submitting || this.data.idCardDraft) return;
    this.editSnapshot = {
      comparison: JSON.stringify(this.editableValues()),
      data: JSON.parse(JSON.stringify({
        licenses: this.data.licenses, licenseOptions: this.data.licenseOptions,
        careerMonth: this.data.careerMonth, hourlyRate: this.data.hourlyRate, dailyRate: this.data.dailyRate,
        careerYears: this.data.careerYears
      }))
    };
    this.setData({ editing: true }, () => this.checkFormValid());
  },

  cancelEditing() {
    if (this.data.submitting || !this.editSnapshot) return;
    const snapshot = this.editSnapshot.data;
    this.editSnapshot = null;
    this.licenseThumbnailRequest = (this.licenseThumbnailRequest || 0) + 1;
    wx.disableAlertBeforeUnload?.();
    this.setData({ ...snapshot, editing: false }, () => this.startEditing());
  },

  nextEditStep() {
    if (!this.data.editing || this.data.submitting || this.data.activeStep >= 3) return;
    this.setData({ activeStep: this.data.activeStep + 1 });
    if (this.data.activeStep === 2) this.loadRegionChangeStatus();
  },

  submitInformation() {
    if (!this.isCurrent() || !this.data.editing || this.data.submitting || this.data.activeStep !== 3) return;
    wx.showModal({
      title: '提交修改', content: '6个月内仅支持一次修改自动审核通过',
      success: result => {
        if (result.confirm && this.isCurrent() && this.data.activeStep === 3) this.saveInformation();
      }
    });
  },

  async saveInformation() {
    if (!this.isCurrent() || !this.data.editing || this.data.submitting || !this.editSnapshot) return;
    this.checkFormValid();
    const current = this.editableValues();
    const previous = JSON.parse(this.editSnapshot.comparison);
    const body = { business_revision: this.data.businessRevision };
    const licensesChanged = JSON.stringify(current.licenses) !== JSON.stringify(previous.licenses);
    if (licensesChanged && (!this.data.licenses.length || this.data.licenses.some(row =>
      !row.certificate_number?.trim() || !row.start_date || !row.end_date || row.end_date <= row.start_date
      || (!row.localPhoto && (!row.photo_url || row.legacy))))) {
      wx.showToast({ title: '请补全证书资料和照片', icon: 'none' });
      return;
    }
    if (current.careerMonth !== previous.careerMonth) {
      if (!current.careerMonth || this.data.careerError) {
        wx.showToast({ title: this.data.careerError || '请选择从业年月', icon: 'none' });
        return;
      }
      body.career_started_month = current.careerMonth;
    }
    for (const [field, key, min, max] of [
      ['hourlyRate', 'hourly_rate', 18.2, 1000], ['dailyRate', 'daily_rate', 145.6, 8000]
    ]) {
      if (current[field] === previous[field]) continue;
      if (!this.validRate(current[field], min, max)) {
        wx.showToast({ title: field === 'hourlyRate' ? '小时工费须为18.2–1000元，最多两位小数' : '日工工费须为145.6–8000元，最多两位小数', icon: 'none' });
        return;
      }
      body[key] = Number(current[field]);
    }
    if (!licensesChanged && Object.keys(body).length === 1) {
      wx.showToast({ title: '本次未修改资料', icon: 'none' });
      return;
    }
    this.setData({ submitting: true });
    wx.showLoading({ title: '保存中', mask: true });
    try {
      if (licensesChanged) {
        body.licenses = [];
        for (const row of this.data.licenses) {
          const photo_draft = row.localPhoto ? await this.uploadLicensePhoto(row.localPhoto, row.license_type) : undefined;
          if (!this.isCurrent()) return;
          body.licenses.push({
            license_type: row.license_type, certificate_number: row.certificate_number,
            start_date: row.start_date, end_date: row.end_date, photo_draft
          });
        }
      }
      const response = await new Promise((resolve, reject) => wx.request({
        url: getApp().globalData.baseUrl + '/electricians/certification/information',
        method: 'PUT', header: { Authorization: 'Bearer ' + this.session.token }, data: body,
        success: resolve, fail: () => reject(new Error('网络请求失败，请重试'))
      }));
      if (!this.isCurrent()) return;
      if (response.statusCode === 409) {
        wx.showModal({
          title: '资料已变化', content: response.data?.message || '请重新加载后核对资料',
          confirmText: '重新加载',
          success: result => {
            if (!this.isCurrent() || !result.confirm) return;
            this.setData({ submitting: false });
            this.cancelEditing();
            this.loadCertificationInfo();
          }
        });
        return;
      }
      if (!response.data?.success) throw new Error(response.data?.message || '保存失败，请重试');
      wx.disableAlertBeforeUnload?.();
      this.editSnapshot = null;
      this.setData({ editing: false });
      this.loadCertificationInfo();
      wx.showToast({ title: response.data.data.status === 'approved' ? '资料已保存' : '认证未通过', icon: 'none' });
    } catch (error) {
      if (this.isCurrent()) wx.showModal({ title: '保存失败', content: error.message, showCancel: false });
    } finally {
      wx.hideLoading();
      if (this.isCurrent()) this.setData({ submitting: false });
    }
  },

  reapplyCertification() {
    if (this.data.regionChangePending) {
      wx.showToast({ title: '区域变更审核中，请等待处理结果', icon: 'none' });
      return;
    }
    if (!['rejected', 'pending'].includes(this.data.certificationStatus) || this.data.submitting) return;
    this.setData({
      mode: 'apply', activeStep: 0, unlockedStep: 0, reapply: true, noticeAgreed: false,
      licenses: this.data.licenses.filter(row => licenseTypes.some(type => type.license_type === row.license_type))
        .map(row => row.legacy && row.certificate_number?.toUpperCase() === 'T' + this.data.formData.idCard.toUpperCase()
          ? { ...row, certificate_number: '' } : row)
    }, () => this.checkFormValid());
  },

  loadRegionChangeStatus() {
    if (!this.isCurrent() || this.data.mode !== 'view' || this.data.regionInfoLoading) return;
    this.setData({ regionInfoLoading: true, regionInfoError: '' });
    const request = {};
    this.regionInfoRequest = request;
    const current = () => this.isCurrent() && this.regionInfoRequest === request;
    wx.request({
      url: getApp().globalData.baseUrl + '/electricians/certification/region-change'
        + (this.notificationRegionChangeId ? '?change_id=' + this.notificationRegionChangeId : ''),
      header: { Authorization: 'Bearer ' + this.session.token },
      success: res => {
        if (!current()) return;
        if (res.data?.code !== 200) {
          this.setData({ regionInfo: null, regionInfoError: res.data?.message || '区域变更信息加载失败' });
          return;
        }
        const info = res.data.data;
        const next = info.next_eligible_at
          ? new Date(new Date(info.next_eligible_at).getTime() + 8 * 3600000).toISOString().slice(0, 19).replace('T', ' ')
          : '';
        this.setData({ regionInfo: { ...info, nextTimeLabel: next } });
      },
      fail: () => { if (current()) this.setData({ regionInfoError: '区域变更信息加载失败，请重试' }); },
      complete: () => { if (current()) this.setData({ regionInfoLoading: false }); }
    });
  },

  openRegionChange() {
    if (!this.data.certificationLoaded || !this.data.regionInfo?.can_apply || this.data.submitting) return;
    this.targetRegionRequest = null;
    this.regionChangeRequestKey = null;
    this.setData({ regionEditorOpen: true, targetRegion: ['', '', ''], regionChangeReason: '',
      targetRegionFees: [], targetRegionError: '' });
  },

  closeRegionChange() {
    if (this.data.submitting) return;
    this.targetRegionRequest = null;
    this.setData({ regionEditorOpen: false, targetRegionChecking: false });
  },

  editRegionChangeReason(event) {
    if (this.data.submitting) return;
    this.regionChangeRequestKey = null;
    this.setData({ regionChangeReason: event.detail.value });
  },

  selectTargetRegion(event) {
    if (this.data.submitting) return;
    const targetRegion = event.detail.value;
    this.regionChangeRequestKey = null;
    const request = {};
    this.targetRegionRequest = request;
    this.setData({ targetRegion, targetRegionFees: [], targetRegionChecking: true, targetRegionError: '' });
    const current = () => this.isCurrent() && this.targetRegionRequest === request;
    wx.request({
      url: getApp().globalData.baseUrl + '/electricians/certification/region',
      method: 'POST', header: { Authorization: 'Bearer ' + this.session.token },
      data: { province: targetRegion[0], city: targetRegion[1], district: targetRegion[2] },
      success: res => {
        if (!current()) return;
        if (res.data?.success && res.data.data?.callout_fees?.length === 3)
          this.setData({ targetRegionFees: res.data.data.callout_fees });
        else this.setData({ targetRegionError: res.data?.message || '目标区域费率读取失败' });
      },
      fail: () => { if (current()) this.setData({ targetRegionError: '目标区域费率读取失败，请重试' }); },
      complete: () => { if (current()) this.setData({ targetRegionChecking: false }); }
    });
  },

  submitRegionChange() {
    if (!this.isCurrent() || this.data.submitting || !this.data.regionEditorOpen) return;
    const { regionInfo, targetRegionFees, targetRegion, regionChangeReason } = this.data;
    if (!regionInfo?.can_apply || targetRegionFees.length !== 3 || this.data.targetRegionChecking) {
      wx.showToast({ title: '请先选择有效区域并读取上门费', icon: 'none' });
      return;
    }
    if (!regionInfo.can_self_change && !regionChangeReason.trim()) {
      wx.showToast({ title: '请填写变更原因', icon: 'none' });
      return;
    }
    const dirty = this.editSnapshot && JSON.stringify(this.editableValues()) !== this.editSnapshot.comparison;
    wx.showModal({
      title: regionInfo.can_self_change ? '确认自主变更' : '确认提交人工审核',
      content: (regionInfo.can_self_change ? '成功后将使用一次自主变更机会。'
        : '提交后认证转为待审核，审核期间按未通过认证门槛处理。')
        + (dirty ? '本次区域变更独立提交，尚未提交的其他资料修改将被放弃。' : ''),
      success: result => {
        if (!result.confirm || !this.isCurrent() || this.data.submitting || !this.data.regionEditorOpen) return;
        if (regionInfo.can_self_change) this.sendRegionChange(targetRegion, regionChangeReason, regionInfo, { result: 'unavailable' });
        else this.requestReviewSubscription(result => this.sendRegionChange(targetRegion, regionChangeReason, regionInfo, result));
      }
    });
  },

  requestReviewSubscription(done) {
    const template = this.data.regionInfo?.subscribe_template_id;
    if (!template || !wx.requestSubscribeMessage) {
      done({ result: 'unavailable' });
      return;
    }
    wx.requestSubscribeMessage({
      tmplIds: [template],
      success: response => {
        if (!this.isCurrent()) return;
        if (response[template] !== 'accept') { done({ result: 'reject' }); return; }
        wx.login({
          success: login => { if (this.isCurrent()) done({ result: 'accept', loginCode: login.code }); },
          fail: () => { if (this.isCurrent()) done({ result: 'unavailable' }); }
        });
      },
      fail: () => { if (this.isCurrent()) done({ result: 'unavailable' }); }
    });
  },

  sendRegionChange(targetRegion, regionChangeReason, regionInfo, authorization) {
    if (!this.isCurrent() || this.data.submitting || !this.data.regionEditorOpen) return;
    if (targetRegion.join(',') !== this.data.targetRegion.join(',')
      || regionChangeReason !== this.data.regionChangeReason) return;
    if (!this.regionChangeRequestKey) {
      this.regionChangeRequestKey = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => {
        const value = Math.floor(Math.random() * 16);
        return (char === 'x' ? value : (value & 3) | 8).toString(16);
      });
    }
    this.setData({ submitting: true });
    wx.request({
      url: getApp().globalData.baseUrl + '/electricians/certification/region-change',
      method: 'POST', header: { Authorization: 'Bearer ' + this.session.token },
      data: { province: targetRegion[0], city: targetRegion[1], district: targetRegion[2],
        reason: regionChangeReason.trim(), business_revision: regionInfo.business_revision,
        subscription_result: authorization.result, notification_template_id: regionInfo.subscribe_template_id || '',
        notification_login_code: authorization.loginCode,
        request_key: this.regionChangeRequestKey },
      success: res => {
        if (!this.isCurrent()) return;
        if (res.data?.code === 200) {
          wx.disableAlertBeforeUnload?.();
          this.editSnapshot = null;
          this.setData({ regionEditorOpen: false, editing: false, regionInfo: null });
          wx.showToast({ title: res.data.data.status === 'pending' ? '已提交人工审核' : '区域已变更', icon: 'none' });
          this.loadCertificationInfo();
        } else wx.showModal({ title: '提交失败', content: res.data?.message || '请稍后重试',
          showCancel: false, success: () => { if (this.isCurrent()) this.loadRegionChangeStatus(); } });
      },
      fail: () => { if (this.isCurrent()) wx.showToast({ title: '网络失败，可重试本次提交', icon: 'none' }); },
      complete: () => { if (this.isCurrent()) this.setData({ submitting: false }); }
    });
  }
});
