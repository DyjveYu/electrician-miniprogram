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
            reapply: false
          }, () => {
            this.checkFormValid();
            this.loadLicenseThumbnails();
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
    if (!this.data.submitting) this.setData({ idCardDraft: null });
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
          idCardFrontPath: cert.id_card_front,
          idCardBackPath: cert.id_card_back,
          savedIdCard: {
            age: cert.id_card_age ?? null,
            gender: cert.id_card_gender || '',
            expiresOn: cert.id_card_expires_on || '',
            longTerm: cert.id_card_is_long_term === true
          }
        });
        wx.showToast({ title: '身份证资料已更新', icon: 'success' });
      },
      fail: () => {
        if (this.isCurrent()) wx.showToast({ title: '保存失败，请重试', icon: 'none' });
      },
      complete: () => {
        if (this.isCurrent()) this.setData({ submitting: false });
      }
    });
  },

  selectLicenses(event) {
    if (this.data.mode !== 'apply' || this.data.submitting) return;
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
    this.invalidateFrom(1);
    const { index, field } = event.currentTarget.dataset;
    this.setData({ [`licenses[${index}].${field}`]: event.detail.value }, () => this.checkFormValid());
  },

  chooseLicensePhoto(event) {
    const type = event.currentTarget.dataset.type;
    if (this.data.mode !== 'apply' || this.data.submitting) return;
    wx.chooseImage({ count: 1, sizeType: ['compressed'], sourceType: ['album', 'camera'],
      success: res => {
        const index = this.data.licenses.findIndex(row => row.license_type === type);
        if (!this.isCurrent() || this.data.submitting || index < 0) return;
        this.invalidateFrom(1);
        this.setData({ [`licenses[${index}].localPhoto`]: res.tempFilePaths[0] }, () => this.checkFormValid());
      }
    });
  },

  tapLicensePhoto(event) {
    if (this.data.mode === 'apply') {
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
    this.invalidateFrom(1);
    this.setData({ careerMonth: event.detail.value }, () => this.checkFormValid());
  },

  checkFormValid() {
    const { licenses, careerMonth, idCardDraft, sameIdentity, formData, workTypes, noticeAgreed } = this.data;
    const id = idCardDraft?.id || (sameIdentity ? formData.idCard : '');
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
      careerYears: this.data.mode === 'view' ? this.data.careerYears : years,
      careerError: this.data.mode === 'apply' && careerMonth && !monthValid
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
    this.setData({ checkingRegion: true });
    wx.request({
      url: `${getApp().globalData.baseUrl}/electricians/certification/region`,
      method: 'POST',
      header: { Authorization: `Bearer ${this.session.token}` },
      data: { province, city, district },
      success: res => {
        if (!isCurrent()) return;
        if (res.data?.success && res.data.data?.callout_fees?.length === 3) {
          this.setData({ calloutFees: res.data.data.callout_fees }, () => {
            if (this.data.activeStep === 2) this.unlockStep(3);
            this.checkFormValid();
          });
        } else {
          wx.showToast({ title: res.data?.message || '接单区域校验失败', icon: 'none' });
        }
      },
      fail: () => {
        if (isCurrent()) wx.showToast({ title: '接单区域校验失败，请重试', icon: 'none' });
      },
      complete: () => { if (isCurrent()) this.setData({ checkingRegion: false }); }
    });
  },

  validRate(value, min, max) {
    return /^\d+(?:\.\d{1,2})?$/.test(value) && Number(value) >= min && Number(value) <= max;
  },

  editRate(e) {
    const field = e.currentTarget.dataset.field;
    if (this.data.mode !== 'apply' || this.data.submitting || !['hourlyRate', 'dailyRate'].includes(field)) return;
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

  reapplyCertification() {
    if (!['rejected', 'pending'].includes(this.data.certificationStatus) || this.data.submitting) return;
    this.setData({
      mode: 'apply', activeStep: 0, unlockedStep: 0, reapply: true, noticeAgreed: false,
      licenses: this.data.licenses.filter(row => licenseTypes.some(type => type.license_type === row.license_type))
        .map(row => row.legacy && row.certificate_number?.toUpperCase() === 'T' + this.data.formData.idCard.toUpperCase()
          ? { ...row, certificate_number: '' } : row)
    }, () => this.checkFormValid());
  }
});
