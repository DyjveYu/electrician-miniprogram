// pages/profile/certification/certification.js
Page({
  data: {
    mode: 'apply', // apply: 申请认证, view: 查看认证
    workTypes: ['maintenance'], // 默认选中维修电工
    isMaintenanceChecked: true, // 维修电工是否选中
    isInstallationChecked: false, // 安装电工是否选中
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
    customItem: '全部',
    idCardFrontPath: '',
    idCardBackPath: '',
    certificatePath: ''
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
          // 解析 work_types 字段
          const workTypes = certInfo.work_types ? certInfo.work_types.split(',') : ['maintenance'];
          this.setData({
            workTypes: workTypes,
            isMaintenanceChecked: workTypes.includes('maintenance'),
            isInstallationChecked: workTypes.includes('installation'),
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
            region: certInfo.region ? certInfo.region.split(',') : ['', '', ''],
            idCardFrontPath: certInfo.id_card_front || '',
            idCardBackPath: certInfo.id_card_back || '',
            certificatePath: certInfo.certificate_img || ''
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

  // 工作类型多选处理
  onWorkTypesChange(e) {
    const values = e.detail.value; // 获取选中的值数组
    console.log('工作类型变更:', values);

    this.setData({
      workTypes: values,
      isMaintenanceChecked: values.includes('maintenance'),
      isInstallationChecked: values.includes('installation')
    });

    this.checkFormValid();
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

  // 跳转至身份证上传页面
  navigateToIdentity() {
    const that = this;
    wx.navigateTo({
      url: '/pages/profile/certification/identity/identity?mode=' + this.data.mode,
      events: {
        acceptDataFromIdentityPage: function (data) {
          that.setData({
            idCardFrontPath: data.idCardFront,
            idCardBackPath: data.idCardBack
          });
          that.checkFormValid();
        }
      },
      success: function (res) {
        res.eventChannel.emit('acceptDataFromOpenerPage', {
          idCardFront: that.data.idCardFrontPath,
          idCardBack: that.data.idCardBackPath
        });
      }
    });
  },

  // 跳转至电工证上传页面
  navigateToElectricianCert() {
    const that = this;
    wx.navigateTo({
      url: '/pages/profile/certification/electrician-cert/electrician-cert?mode=' + this.data.mode,
      events: {
        acceptDataFromCertPage: function (data) {
          that.setData({
            certificatePath: data.certificatePath
          });
          that.checkFormValid();
        }
      },
      success: function (res) {
        res.eventChannel.emit('acceptDataFromOpenerPage', {
          certificatePath: that.data.certificatePath
        });
      }
    });
  },

  // 检查表单是否有效
  checkFormValid() {
    const { formData } = this.data;

    // 检查所有必填字段（包括工作类型和图片）
    const isValid = this.data.workTypes.length > 0 &&
      formData.realName &&
      formData.idCard &&
      formData.certificateNumber &&
      formData.certificateStartDate &&
      formData.certificateEndDate &&
      formData.serviceArea &&
      this.data.idCardFrontPath &&
      this.data.idCardBackPath;

    this.setData({
      submitDisabled: !isValid
    });
  },

  // 提交认证申请
  submitCertification() {
    if (this.data.submitDisabled) {
      console.log('❌ 表单未完成，无法提交');
      return;
    }

    const app = getApp();

    console.log('========== 开始提交电工认证 ==========');
    console.log('1. BaseUrl:', app.globalData.baseUrl);
    console.log('2. Token:', app.globalData.token ? '存在' : '不存在');

    wx.showLoading({
      title: '提交中',
    });

    // 构建请求数据
    const requestData = {
      work_types: this.data.workTypes.join(','), // 将数组转换为逗号分隔的字符串
      real_name: this.data.formData.realName,
      id_card: this.data.formData.idCard,
      electrician_cert_no: this.data.formData.certificateNumber,
      cert_start_date: this.data.formData.certificateStartDate,
      cert_end_date: this.data.formData.certificateEndDate,
      service_area: this.data.formData.serviceArea,
      region: this.data.region.join(','),
      // 添加图片路径
      id_card_front: this.data.idCardFrontPath,
      id_card_back: this.data.idCardBackPath,
      certificate_img: this.data.certificatePath
    };

    console.log('3. 请求数据:', JSON.stringify(requestData, null, 2));

    const fullUrl = `${app.globalData.baseUrl}/electricians/certification`;
    console.log('4. 完整URL:', fullUrl);

    wx.request({
      url: fullUrl,
      method: 'POST',
      header: {
        'Authorization': `Bearer ${app.globalData.token}`,
        'Content-Type': 'application/json'
      },
      data: requestData,
      success: (res) => {
        console.log('5. ✅ 请求成功');
        console.log('6. HTTP状态码:', res.statusCode);
        console.log('7. 响应数据:', JSON.stringify(res.data, null, 2));

        const code = res.data.code;
        if (code === 0 || code === 200) {
          console.log('8. ✅ 业务成功');
          wx.showToast({
            title: '提交成功',
            icon: 'success'
          });

          // 延迟返回上一页
          setTimeout(() => {
            console.log('9. 返回上一页');
            wx.navigateBack();
          }, 1500);
        } else {
          console.log('8. ❌ 业务失败, code:', code);
          wx.showToast({
            title: res.data.message || '提交失败',
            icon: 'none'
          });
        }
      },
      fail: (err) => {
        console.error('5. ❌ 请求失败');
        console.error('6. 错误信息:', JSON.stringify(err, null, 2));
        wx.showToast({
          title: '提交失败',
          icon: 'none'
        });
      },
      complete: () => {
        console.log('========== 提交流程结束 ==========\n');
        wx.hideLoading();
      }
    });
  },



  // 重新申请认证
  reapplyCertification() {
    this.setData({
      mode: 'apply',
      certificationStatus: ''
    });
  }
});