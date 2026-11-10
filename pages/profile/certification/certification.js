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
    detailsStep: false,
    certificationLoaded: false,
    regionStep: false,
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
    const app = getApp();

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
        const ok = res?.data?.success === true || res?.data?.code === 0 || res?.data?.code === 200;
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
            sameIdentity: cert?.license_invalidated_after_approval === true,
            reapply: false
          }, () => {
            this.checkFormValid();
            this.loadLicenseThumbnails();
          });
        }
      },
      fail: () => {
        if (!this.isCurrent()) return;
        wx.showToast({
          title: '加载失败',
          icon: 'none'
        });
      },
      complete: () => {
        wx.hideLoading();
      }
    });
  },

  // 工作类型多选处理
  onWorkTypesChange(e) {
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
    this.setData({
      region: e.detail.value
    });

    // 更新服务区域字段
    const serviceArea = e.detail.value.join('');
    this.setData({
      'formData.serviceArea': serviceArea
    });

    this.checkFormValid();
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

              this.setData({
                region: region,
                'formData.serviceArea': region.join('')
              });

              this.checkFormValid();
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
    if (!this.data.certificationLoaded || !this.isCurrent() || this.data.submitting) return;
    const readOnly = this.data.mode === 'view' && this.data.certificationStatus !== 'approved';
    wx.navigateTo({
      url: '/pages/profile/certification/identity/identity',
      events: {
        acceptDataFromIdentityPage: data => {
          if (!this.isCurrent() || readOnly) return;
          const { realName, idCard } = this.data.formData;
          const fields = {
            idCardDraft: data,
            idCardUpdateMatches: data.name === realName && data.id === idCard.toUpperCase(),
            detailsStep: false
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

  nextCertificationStep() {
    if (this.data.idCardDraft || this.data.sameIdentity || this.data.mode === 'view') this.setData({ detailsStep: true });
  },

  previousCertificationStep() {
    this.setData({ detailsStep: false });
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
    const licenses = licenseTypes.filter(type => selected.includes(type.license_type))
      .map(type => current.find(item => item.license_type === type.license_type) || { ...type });
    this.setData({ licenses, licenseOptions: licenseTypes.map(type => ({
      ...type, checked: selected.includes(type.license_type)
    })) }, () => this.checkFormValid());
  },

  editLicense(event) {
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
    this.setData({ careerMonth: event.detail.value }, () => this.checkFormValid());
  },

  checkFormValid() {
    const { licenses, careerMonth, idCardDraft, sameIdentity, formData, workTypes, region, noticeAgreed } = this.data;
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
      submitDisabled: !(businessValid && formData.phone && region[0] && noticeAgreed)
    });
  },

  nextRegionStep() {
    if (this.data.mode === 'view' || this.data.businessValid) {
      this.setData({ regionStep: true });
    } else {
      wx.showToast({ title: this.data.careerError || '请补全证书和从业年月', icon: 'none' });
    }
  },

  previousRegionStep() {
    if (!this.data.submitting) this.setData({ regionStep: false });
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
    const { submitDisabled, regionStep, region, licenses, reapply, idCardDraft, businessRevision, careerMonth, workTypes } = this.data;
    if (submitDisabled || !regionStep || region.some(item => !item || item === '全部')) {
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
          career_started_month: careerMonth, licenses: rows
        },
        success: res => {
          if (res.data?.success && res.data.data) resolve(res.data);
          else reject(new Error(res.data?.message || '提交失败'));
        },
        fail: () => reject(new Error('网络请求失败，请重试'))
      }));
      if (!this.isCurrent()) return;
      this.setData({
        mode: 'view', detailsStep: false, regionStep: false, reapply: false,
        certificationStatus: result.data.status,
        rejectReason: result.data.reject_reason || '', idCardDraft: null
      });
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
    if (this.data.certificationStatus !== 'rejected' || this.data.submitting) return;
    this.setData({
      mode: 'apply', detailsStep: false, regionStep: false, reapply: true,
      licenses: this.data.licenses.filter(row => licenseTypes.some(type => type.license_type === row.license_type))
        .map(row => row.legacy && row.certificate_number?.toUpperCase() === 'T' + this.data.formData.idCard.toUpperCase()
          ? { ...row, certificate_number: '' } : row)
    }, () => this.checkFormValid());
  }
});
