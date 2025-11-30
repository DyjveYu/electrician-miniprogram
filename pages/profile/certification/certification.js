// pages/profile/certification/certification.js
Page({
  data: {
    mode: 'apply', // apply: 申请认证, view: 查看认证
    formData: {
      realName: '',
      idCard: '',
      certificateNumber: '',
      certificateStartDate: '',
      certificateEndDate: '',
      serviceArea: ''
    },
    certificationStatus: '', // pending: 审核中, approved: 已通过, rejected: 已拒绝
    rejectReason: '',
    submitDisabled: true,
    region: ['', '', ''],
    customItem: '全部'
  },

  onLoad(options) {
    // 设置页面模式：申请认证或查看认证
    if (options.mode) {
      this.setData({ mode: options.mode });
    }

    // 如果是查看模式，加载认证信息
    if (this.data.mode === 'view') {
      this.loadCertificationInfo();
    }
  },

  // 加载认证信息
  loadCertificationInfo() {
    const app = getApp();

    wx.showLoading({
      title: '加载中',
    });

    wx.request({
      url: `${app.globalData.baseUrl}/api/electricians/certification`,
      method: 'GET',
      header: {
        'Authorization': `Bearer ${app.globalData.token}`
      },
      success: (res) => {
        if (res.data.code === 0 && res.data.data) {
          const certInfo = res.data.data;
          this.setData({
            formData: {
              realName: certInfo.real_name || '',
              idCard: certInfo.id_card || '',
              certificateNumber: certInfo.certificate_number || '',
              certificateStartDate: certInfo.certificate_start_date || '',
              certificateEndDate: certInfo.certificate_end_date || '',
              serviceArea: certInfo.service_area || ''
            },
            certificationStatus: certInfo.status || '',
            rejectReason: certInfo.reject_reason || '',
            region: certInfo.region ? certInfo.region.split(',') : ['', '', '']
          });
        }
      },
      fail: () => {
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

  // 表单输入处理
  onInputChange(e) {
    const { field } = e.currentTarget.dataset;
    const { value } = e.detail;

    this.setData({
      [`formData.${field}`]: value
    });

    this.checkFormValid();
  },

  // 日期选择器变更
  bindDateChange(e) {
    const { field } = e.currentTarget.dataset;
    const value = e.detail.value;

    this.setData({
      [`formData.${field}`]: value
    });

    this.checkFormValid();
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

  // 检查表单是否有效
  checkFormValid() {
    const { formData } = this.data;

    // 检查所有必填字段
    const isValid = formData.realName &&
      formData.idCard &&
      formData.certificateNumber &&
      formData.certificateStartDate &&
      formData.certificateEndDate &&
      formData.serviceArea;

    this.setData({
      submitDisabled: !isValid
    });
  },

  // 提交认证申请
  submitCertification() {
    if (this.data.submitDisabled) {
      return;
    }

    const app = getApp();

    wx.showLoading({
      title: '提交中',
    });

    // 构建请求数据
    const requestData = {
      real_name: this.data.formData.realName,
      id_card: this.data.formData.idCard,
      electrician_cert_no: this.data.formData.certificateNumber,
      cert_start_date: this.data.formData.certificateStartDate,
      cert_end_date: this.data.formData.certificateEndDate,
      service_area: this.data.formData.serviceArea,
      region: this.data.region.join(',')
    };


    wx.request({
      url: `${app.globalData.baseUrl}/electricians/certification`,
      method: 'POST',
      header: {
        'Authorization': `Bearer ${app.globalData.token}`,
        'Content-Type': 'application/json'
      },
      data: requestData,
      success: (res) => {
        const code = res.data.code;
        if (code === 0 || code === 200) {
          wx.showToast({
            title: '提交成功',
            icon: 'success'
          });

          // 延迟返回上一页
          setTimeout(() => {
            wx.navigateBack();
          }, 1500);
        } else {
          wx.showToast({
            title: res.data.message || '提交失败',
            icon: 'none'
          });
        }
      },
      fail: () => {
        wx.showToast({
          title: '提交失败',
          icon: 'none'
        });
      },
      complete: () => {
        wx.hideLoading();
      }
    });
  },

  // 预览图片
  previewImage(e) {
    const { type } = e.currentTarget.dataset;
    let url = '';

    if (type === 'idCardFront') {
      url = this.data.idCardFrontPath;
    } else if (type === 'idCardBack') {
      url = this.data.idCardBackPath;
    } else if (type === 'certificate') {
      url = this.data.certificatePath;
    }

    if (url) {
      wx.previewImage({
        urls: [url],
        current: url
      });
    }
  },

  // 重新申请认证
  reapplyCertification() {
    this.setData({
      mode: 'apply',
      certificationStatus: ''
    });
  }
});