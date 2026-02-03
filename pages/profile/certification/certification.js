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
    certificatePath: '',
    reapply: false,
    submitting: false
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
    // 设置页面模式：申请认证或查看认证
    if (options.mode) {
      this.setData({ mode: options.mode });
    }

    // 如果是查看模式，加载认证信息
    if (this.data.mode === 'view') {
      this.loadCertificationInfo();
    }
  },
  onShow() {
    // 每次进入页面尝试刷新认证信息，避免状态滞留
    this.loadCertificationInfo();
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
          const normalizeDate = (val) => {
            if (!val) return '';
            const s = String(val);
            if (s.length >= 10) return s.slice(0, 10);
            return s;
          };
          const certificateStartDate = normalizeDate(
            cert?.cert_start_date || cert?.certificate_start_date || cert?.certificateStartDate
          ) || this.data.formData.certificateStartDate;
          const certificateEndDate = normalizeDate(
            cert?.cert_end_date || cert?.certificate_end_date || cert?.certificateEndDate
          ) || this.data.formData.certificateEndDate;
          const serviceArea = cert?.service_area || (Array.isArray(region) ? region.join('') : '') || this.data.formData.serviceArea;
          this.setData({
            workTypes,
            isMaintenanceChecked: workTypes.includes('maintenance'),
            isInstallationChecked: workTypes.includes('installation'),
            formData: {
              realName: cert?.real_name || this.data.formData.realName,
              idCard: cert?.id_card || this.data.formData.idCard,
              certificateNumber: cert?.certificate_number || cert?.electrician_cert_no || this.data.formData.certificateNumber,
              certificateStartDate,
              certificateEndDate,
              serviceArea
            },
            certificationStatus: status,
            rejectReason: cert?.reject_reason || '',
            region,
            idCardFrontPath: this.data.idCardFrontPath || cert?.id_card_front || '',
            idCardBackPath: this.data.idCardBackPath || cert?.id_card_back || '',
            certificatePath: this.data.certificatePath || cert?.certificate_img || '',
            reapply: false
          }, () => {
            this.checkFormValid();
          });
          // 若状态存在且不是 none，则切换到查看模式
          if (status && status !== 'none') {
            this.setData({ mode: 'view' });
          }
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
    if (this.data.mode === 'view' && this.data.certificationStatus !== 'approved') {
      wx.showToast({ title: '认证中不可修改', icon: 'none' });
      return;
    }
    const that = this;
    const targetMode = (this.data.mode === 'view' && this.data.certificationStatus === 'approved') ? 'apply' : this.data.mode;
    wx.navigateTo({
      url: '/pages/profile/certification/identity/identity?mode=' + targetMode,
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
    if (this.data.mode === 'view' && this.data.certificationStatus !== 'approved') {
      wx.showToast({ title: '认证中不可修改', icon: 'none' });
      return;
    }
    const that = this;
    const targetMode = (this.data.mode === 'view' && this.data.certificationStatus === 'approved') ? 'apply' : this.data.mode;
    wx.navigateTo({
      url: '/pages/profile/certification/electrician-cert/electrician-cert?mode=' + targetMode,
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

    const baseValid = this.data.workTypes.length > 0 &&
      formData.realName &&
      formData.idCard &&
      formData.certificateNumber &&
      formData.certificateStartDate &&
      formData.certificateEndDate &&
      formData.serviceArea &&
      true;

    const imagesValid = this.data.idCardFrontPath &&
      this.data.idCardBackPath &&
      this.data.certificatePath;

    const isFirstApplySubmit = this.data.mode === 'apply' && this.data.reapply !== true;
    const isValid = isFirstApplySubmit ? (baseValid && imagesValid) : baseValid;

    this.setData({
      submitDisabled: !isValid
    });
  },

  // 🔥 2026.1.27 新增：上传单个图片到服务器
  // 1.28 修改：
  // 🔥 修复：上传单个图片到服务器（只返回相对路径）
uploadImage(filePath, fieldName) {
  return new Promise((resolve, reject) => {
    // 🔥 新增：防御性检查
    if (!filePath || typeof filePath !== 'string') {
      console.error(`🔥 ${fieldName} 路径无效:`, filePath);
      reject(new Error(`${fieldName}路径无效`));
      return;
    }

    console.log(`🔥 uploadImage 开始处理 ${fieldName}:`, filePath);
    
    // 如果已经是相对路径，直接返回
    if (filePath.startsWith('/uploads/')) {
      console.log(`🔥 ${fieldName} 已是相对路径:`, filePath);
      resolve(filePath);
      return;
    }

    // 🔥 使用字符串方法提取相对路径
    if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
      console.log(`🔥 ${fieldName} 是完整URL，提取相对路径`);
      try {
        // 使用正则提取 /uploads/ 开头的路径
        const match = filePath.match(/\/uploads\/.+$/);
        if (match) {
          const relativePath = match[0];
          console.log(`🔥 ${fieldName} 提取的相对路径:`, relativePath);
          resolve(relativePath);
          return;
        }
        
        // 备用方案：查找域名后的路径部分
        const urlParts = filePath.split('/');
        const uploadsIndex = urlParts.indexOf('uploads');
        if (uploadsIndex > 0) {
          const relativePath = '/' + urlParts.slice(uploadsIndex).join('/');
          console.log(`🔥 ${fieldName} 提取的相对路径:`, relativePath);
          resolve(relativePath);
          return;
        }
        
        console.error(`🔥 ${fieldName} 无法从URL中提取相对路径:`, filePath);
        reject(new Error('无法提取相对路径'));
      } catch (e) {
        console.error(`🔥 ${fieldName} 提取相对路径失败:`, e);
        reject(new Error('路径解析失败'));
      }
      return;
    }

    // 如果不是URL也不是相对路径，说明是本地文件，需要上传
    console.log(`🔥 开始上传 ${fieldName}:`, filePath);

    // 🔥 使用 getApp() 获取全局对象
    const app = getApp();

    wx.uploadFile({
      url: `${app.globalData.baseUrl}/upload/certification`,
      filePath: filePath,
      name: 'certification',
      header: {
        'Authorization': `Bearer ${app.globalData.token}`
      },
      success: (res) => {
        console.log(`🔥 ${fieldName} 上传响应 statusCode:`, res.statusCode);
        console.log(`🔥 ${fieldName} 上传响应 data:`, res.data);
        
        if (res.statusCode !== 200) {
          console.error(`🔥 ${fieldName} 上传失败，状态码:`, res.statusCode);
          reject(new Error(`${fieldName}上传失败`));
          return;
        }

        try {
          const data = JSON.parse(res.data);
          console.log(`🔥 ${fieldName} 解析后的数据:`, data);

          if (data.code === 200 && data.data && data.data.url) {
            let url = data.data.url;
            console.log(`🔥 ${fieldName} 服务器返回的url:`, url);
            
            // 🔥 只保存相对路径
            let relativePath;
            
            if (url.startsWith('http://') || url.startsWith('https://')) {
              console.log(`🔥 ${fieldName} 是完整URL，提取相对路径`);
              
              const match = url.match(/\/uploads\/.+$/);
              if (match) {
                relativePath = match[0];
              } else {
                const urlParts = url.split('/');
                const uploadsIndex = urlParts.indexOf('uploads');
                if (uploadsIndex > 0) {
                  relativePath = '/' + urlParts.slice(uploadsIndex).join('/');
                } else {
                  console.warn(`🔥 ${fieldName} 无法提取标准路径，使用原始值`);
                  relativePath = url;
                }
              }
            } else if (url.startsWith('/')) {
              relativePath = url;
            } else {
              relativePath = '/' + url;
            }
            
            console.log(`🔥 ${fieldName} 最终相对路径:`, relativePath);
            resolve(relativePath);
          } else {
            console.error(`🔥 ${fieldName} 返回数据格式错误:`, data);
            reject(new Error(data.message || `${fieldName}上传失败`));
          }
        } catch (e) {
          console.error(`🔥 ${fieldName} 解析响应失败:`, e);
          console.error(`🔥 ${fieldName} 原始响应:`, res.data);
          reject(new Error('解析响应失败'));
        }
      },
      fail: (err) => {
        console.error(`🔥 ${fieldName} 上传请求失败:`, err);
        reject(new Error('网络错误'));
      }
    });
  });
},

  // 🔥 2026.1.28 修改：提交认证申请
  async submitCertification() {
  if (this.data.submitDisabled) {
    wx.showToast({ title: '请完善信息后再提交', icon: 'none' });
    return;
  }

  const app = getApp();

  console.log('========== 开始提交电工认证 ==========');
  console.log('1. BaseUrl:', app.globalData.baseUrl);
  console.log('2. Token:', app.globalData.token ? '存在' : '不存在');
 // 🔥 1.28 11：09：详细的数据检查
  console.log('3. 当前页面数据完整性检查:');
  console.log('   - idCardFrontPath 类型:', typeof this.data.idCardFrontPath);
  console.log('   - idCardFrontPath 值:', this.data.idCardFrontPath);
  console.log('   - idCardBackPath 类型:', typeof this.data.idCardBackPath);
  console.log('   - idCardBackPath 值:', this.data.idCardBackPath);
  console.log('   - certificatePath 类型:', typeof this.data.certificatePath);
  console.log('   - certificatePath 值:', this.data.certificatePath);
  console.log('4. 完整 data 对象:', JSON.stringify({
    idCardFrontPath: this.data.idCardFrontPath,
    idCardBackPath: this.data.idCardBackPath,
    certificatePath: this.data.certificatePath
  }));


  wx.showLoading({
    title: '上传图片中...',
    mask: true
  });
  this.setData({ submitting: true });

  try {
    // 🔥 步骤1：上传所有本地图片到服务器，获取相对路径
    console.log('5. 开始处理图片路径...');
   
    let idCardFrontPath = this.data.idCardFrontPath;
    let idCardBackPath = this.data.idCardBackPath;
    let certificatePath = this.data.certificatePath;

    console.log('6. 复制后的路径值:');
    console.log('   - idCardFrontPath:', idCardFrontPath);
    console.log('   - idCardBackPath:', idCardBackPath);
    console.log('   - certificatePath:', certificatePath);

    // 🔥 关键修复：检查路径是否有效
    // 上传身份证正面
     if (idCardFrontPath && typeof idCardFrontPath === 'string' && idCardFrontPath.trim()) {
      console.log('🔥 处理身份证正面:', idCardFrontPath);
      idCardFrontPath = await this.uploadImage(idCardFrontPath, '身份证正面');
    } else {
      console.error('🔥 ❌ 身份证正面路径无效:', {
        value: idCardFrontPath,
        type: typeof idCardFrontPath,
        boolean: !!idCardFrontPath
      });
      throw new Error('身份证正面未上传或路径无效');
    }

    // 上传身份证背面
    if (idCardBackPath && typeof idCardBackPath === 'string' && idCardBackPath.trim()) {
      console.log('🔥 处理身份证背面:', idCardBackPath);
      idCardBackPath = await this.uploadImage(idCardBackPath, '身份证背面');
    } else {
      console.error('🔥 ❌ 身份证背面路径无效:', {
        value: idCardBackPath,
        type: typeof idCardBackPath,
        boolean: !!idCardBackPath
      });
      throw new Error('身份证背面未上传或路径无效');
    }

    // 上传电工证
    if (certificatePath && typeof certificatePath === 'string' && certificatePath.trim()) {
      console.log('🔥 处理电工证:', certificatePath);
      wx.showLoading({ title: '上传电工证...', mask: true });
      certificatePath = await this.uploadImage(certificatePath, '电工证');
    } else {
      console.error('🔥 ❌ 电工证路径无效:', {
        value: certificatePath,
        type: typeof certificatePath,
        boolean: !!certificatePath
      });
      throw new Error('电工证未上传或路径无效');
    }

    console.log('7. ✅ 所有图片处理完成（相对路径）');
    console.log('   - 身份证正面:', idCardFrontPath);
    console.log('   - 身份证背面:', idCardBackPath);
    console.log('   - 电工证:', certificatePath);

    // 🔥 验证：确保所有图片都有值
    if (!idCardFrontPath || !idCardBackPath || !certificatePath) {
      throw new Error('请上传所有必需的证件照片');
    }

    // 🔥 步骤2：提交认证数据到服务器（使用相对路径）
    wx.showLoading({ title: '提交认证...', mask: true });

    const requestData = {
      work_types: this.data.workTypes.join(','),
      real_name: this.data.formData.realName,
      id_card: this.data.formData.idCard,
      electrician_cert_no: this.data.formData.certificateNumber,
      cert_start_date: this.data.formData.certificateStartDate,
      cert_end_date: this.data.formData.certificateEndDate,
      service_area: this.data.formData.serviceArea,
      region: this.data.region.join(','),
      id_card_front: idCardFrontPath,
      id_card_back: idCardBackPath,
      certificate_img: certificatePath
    };

    console.log('8. 请求数据:', JSON.stringify(requestData, null, 2));

    const isReapply = this.data.reapply === true;
    const fullUrl = isReapply 
      ? `${app.globalData.baseUrl}/electricians/certification/reapply` 
      : `${app.globalData.baseUrl}/electricians/certification`;
    
    console.log('6. 完整URL:', fullUrl);

    await new Promise((resolve, reject) => {
      wx.request({
        url: fullUrl,
        method: isReapply ? 'PUT' : 'POST',
        header: {
          'Authorization': `Bearer ${app.globalData.token}`,
          'Content-Type': 'application/json'
        },
        data: requestData,
        success: (res) => {
          console.log('7. ✅ 请求成功');
          console.log('8. HTTP状态码:', res.statusCode);
          console.log('9. 响应数据:', JSON.stringify(res.data, null, 2));

          const ok = res?.data?.success === true || res?.data?.code === 0 || res?.data?.code === 200;
          if (ok) {
            resolve(res.data);
          } else {
            reject(new Error(res.data.message || '提交失败'));
          }
        },
        fail: (err) => {
          console.error('7. ❌ 请求失败:', err);
          reject(err);
        }
      });
    });

    // 🔥 步骤3：提交成功
    console.log('10. ✅ 认证提交成功');
    wx.hideLoading();
    
    wx.showToast({
      title: '提交成功',
      icon: 'success'
    });

    // 🔥 更新本地存储为相对路径
    this.setData({
      idCardFrontPath: idCardFrontPath,
      idCardBackPath: idCardBackPath,
      certificatePath: certificatePath
    });

    if (isReapply) {
      this.setData({
        mode: 'view',
        certificationStatus: 'pending',
        rejectReason: '',
        reapply: false
      }, () => {
        this.loadCertificationInfo();
      });
    } else {
      setTimeout(() => {
        console.log('11. 返回上一页');
        wx.navigateBack();
      }, 1500);
    }

  } catch (error) {
    console.error('❌ 提交过程出错:', error);
    wx.hideLoading();
    
    wx.showModal({
      title: '提交失败',
      content: error.message || '请检查网络后重试',
      showCancel: true,
      confirmText: '重试',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          this.submitCertification();
        }
      }
    });
  } finally {
    console.log('========== 提交流程结束 ==========\n');
    this.setData({ submitting: false });
  }
},



  // 重新申请认证
  reapplyCertification() {
    const isApprovedView = this.data.mode === 'view' && this.data.certificationStatus === 'approved';
    if (isApprovedView) {
      this.setData({ reapply: true }, () => {
        this.checkFormValid();
        this.uploadImage();
        this.submitCertification();
      });
      return;
    }
    this.setData({
      mode: 'apply',
      certificationStatus: '',
      rejectReason: '',
      reapply: false
    }, () => {
      this.checkFormValid();
    });
  }
});
