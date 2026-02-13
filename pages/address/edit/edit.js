// pages/address/edit/edit.js
Page({
  data: {
    addressId: '',
    formData: {
      contactName: '',
      contactPhone: '',
      province: '',
      city: '',
      district: '',
      detail: '',
      locationName: '', // 新增位置名称
      latitude: null,   // 新增经度
      longitude: null,  // 新增纬度
      isDefault: false
    },
    saving: false,
    isEdit: false
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ addressId: options.id, isEdit: true });
      this.loadAddressDetail();
    }
  },

  // 加载地址详情
  loadAddressDetail() {
    const app = getApp();
    wx.request({
      url: `${app.globalData.baseUrl}/addresses/${this.data.addressId}`,
      method: 'GET',
      header: {
        'Authorization': `Bearer ${app.globalData.token}`
      },
      success: (res) => {
        const ok = res?.data?.code === 0 || res?.data?.code === 200;
        const payload = res?.data?.data;
        if (ok && payload) {
          const item = payload.address || payload;
          const mapped = {
            contactName: item.contact_name || item.contactName || '',
            contactPhone: item.contact_phone || item.contactPhone || '',
            province: item.province || '',
            city: item.city || '',
            district: item.district || '',
            detail: item.detail_address || item.detail || '',
            locationName: item.location_name || item.locationName || '',
            latitude: typeof item.latitude !== 'undefined' ? item.latitude : null,
            longitude: typeof item.longitude !== 'undefined' ? item.longitude : null,
            isDefault: !!(item.is_default || item.isDefault)
          };
          this.setData({ formData: mapped });
        } else {
          wx.showToast({ title: res?.data?.message || '加载地址失败', icon: 'none' });
        }
      }
    });
  },

  // 输入联系人
  onContactNameInput(e) {
    this.setData({ 'formData.contactName': e.detail.value });
  },

  // 输入电话
  onContactPhoneInput(e) {
    this.setData({ 'formData.contactPhone': e.detail.value });
  },

  // 选择地区 (调用微信地图选点)
  chooseLocation() {
    const that = this;
    const app = getApp();

    // 优先使用当前表单的坐标，其次使用全局定位，最后不传(让API自动定位)
    let latitude = that.data.formData.latitude;
    let longitude = that.data.formData.longitude;

    // 如果表单没有坐标，且全局有坐标，则使用全局坐标
    if (!latitude && app.globalData.location) {
      latitude = app.globalData.location.latitude;
      longitude = app.globalData.location.longitude;
    }

    // 转换为数字或undefined，避免空字符串
    latitude = latitude ? Number(latitude) : undefined;
    longitude = longitude ? Number(longitude) : undefined;

    wx.chooseLocation({
      latitude: latitude,
      longitude: longitude,
      success(res) {
        console.log('地图选点结果:', res);
        // 解析地址 (简单解析，为了满足后端必填校验)
        // 腾讯地图返回的 address 通常格式为 "北京市海淀区..." 或 "广东省深圳市南山区..."
        // 我们尝试提取省市区
        const parsed = that.parseAddress(res.address);

        that.setData({
          'formData.locationName': res.name, // 地点名称，如"冠华苑"
          'formData.province': parsed.province,
          'formData.city': parsed.city,
          'formData.district': parsed.district,
          'formData.detail': res.address, // 将详细地址填入
          'formData.latitude': res.latitude,
          'formData.longitude': res.longitude
        });
      },
      fail(err) {
        console.error('地图选点失败/取消:', err);
        // 如果是权限问题，可能需要引导用户打开权限
        if (err.errMsg.indexOf('auth deny') >= 0) {
          wx.showModal({
            title: '提示',
            content: '需要获取您的地理位置授权，请在设置中打开',
            success(modalRes) {
              if (modalRes.confirm) {
                wx.openSetting();
              }
            }
          });
        }
      }
    });
  },

  // 简单的地址解析辅助函数
  // 地址解析辅助函数 - 专门优化直辖市
parseAddress(addressStr) {
  if (!addressStr) return { province: '', city: '', district: '' };
  
  console.log('原始地址:', addressStr);
  
  let province = '';
  let city = '';
  let district = '';
  
  // 1. 直辖市快速匹配（北京、上海、天津、重庆）
  if (addressStr.startsWith('北京市')) {
    province = '北京市';
    city = '北京市';
    // 提取区名：北京市东城区... → 东城区
    const districtMatch = addressStr.match(/北京市(.+?[区县])/);
    district = districtMatch ? districtMatch[1] : '';
  }
  else if (addressStr.startsWith('上海市')) {
    province = '上海市';
    city = '上海市';
    const districtMatch = addressStr.match(/上海市(.+?[区县])/);
    district = districtMatch ? districtMatch[1] : '';
  }
  else if (addressStr.startsWith('天津市')) {
    province = '天津市';
    city = '天津市';
    const districtMatch = addressStr.match(/天津市(.+?[区县])/);
    district = districtMatch ? districtMatch[1] : '';
  }
  else if (addressStr.startsWith('重庆市')) {
    province = '重庆市';
    city = '重庆市';
    const districtMatch = addressStr.match(/重庆市(.+?[区县])/);
    district = districtMatch ? districtMatch[1] : '';
  }
  else {
    // 2. 非直辖市，按空格或逗号分割
    const parts = addressStr.split(/[\s,，]+/);
    province = parts[0] || '';
    
    // 尝试提取市
    if (parts.length > 1) {
      const cityPart = parts[1];
      // 如果包含"市"，取完整词；否则尝试匹配
      if (cityPart.includes('市')) {
        city = cityPart;
      } else if (parts.length > 2) {
        city = parts[1];
        district = parts[2];
      }
    }
    
    // 如果还没有区，尝试从剩余字符串匹配
    if (!district && addressStr.length > province.length + city.length) {
      const remain = addressStr.slice((province + city).length);
      const districtMatch = remain.match(/^(.+?[区县市])/);
      district = districtMatch ? districtMatch[1] : '';
    }
  }
  
  // 如果还是解析失败，使用原始address的前几个词作为fallback
  if (!province) {
    const parts = addressStr.split(/[\s,，]+/);
    province = parts[0] || '北京市';
    city = parts[1] || '北京市';
    district = parts[2] || '';
  }
  
  console.log('解析结果:', { province, city, district });
  
  return { province, city, district };
},
  // 选择地区 旧的方法。
  chooseRegion() {
    const that = this;
    wx.chooseLocation({
      success(res) {
        that.setData({
          'formData.province': res.address.split(' ')[0] || '',
          'formData.city': res.address.split(' ')[1] || '',
          'formData.district': res.address.split(' ')[2] || '',
          'formData.detail': res.name
        });
      }
    });
  },

  // 输入详细地址
  onDetailInput(e) {
    this.setData({ 'formData.detail': e.detail.value });
  },

  // 切换默认地址
  toggleDefault() {
    this.setData({ 'formData.isDefault': !this.data.formData.isDefault });
  },

  // 保存地址
  saveAddress() {
    if (!this.validateForm()) return;
    if (this.data.saving) return;

    this.setData({ saving: true });

    const app = getApp();
    const url = this.data.isEdit
      ? `${app.globalData.baseUrl}/addresses/${this.data.addressId}`
      : `${app.globalData.baseUrl}/addresses`;
    const method = this.data.isEdit ? 'PUT' : 'POST';

    console.log('提交地址前的数据:', this.data.formData);
    // ① 直接使用 formData
    const formData = this.data.formData;
    // ② 打印确认实际提交的数据
    console.log('实际提交到后端的数据:', formData);
    // ③ 调用接口
    wx.request({
      url,
      method,
      header: {
        'Authorization': `Bearer ${app.globalData.token}`
      },

      data: formData,
      success: (res) => {
        this.setData({ saving: false });
        if (res.data.code === 0 || res.data.code === 200) {
          wx.showToast({ title: '保存成功！', icon: 'none', duration: 1500 });
          setTimeout(() => {
            const pages = getCurrentPages();
            if (pages.length > 1) {
              wx.navigateBack();
            } else {
              wx.redirectTo({ url: '/pages/address/list/list' });
            }
          }, 1500);
        } else {
          wx.showToast({ title: res.data.message || '保存失败', icon: 'none' });
        }
      },
      fail: () => {
        this.setData({ saving: false });
        wx.showToast({ title: '网络错误', icon: 'none' });
      }
    });
  },

  // 表单验证
  validateForm() {
    const { contactName, contactPhone, detail } = this.data.formData;

    if (!contactName.trim()) {
      wx.showToast({ title: '请输入联系人', icon: 'none' });
      return false;
    }
    const hanCount = (contactName.match(/[\u4e00-\u9fa5]/g) || []).length;
    if (hanCount < 2) {
      wx.showToast({ title: '联系人姓名至少需要两个汉字', icon: 'none' });
      return false;
    }

    if (!contactPhone.trim()) {
      wx.showToast({ title: '请输入联系电话', icon: 'none' });
      return false;
    }

    const phoneReg = /^1[3-9]\d{9}$/;
    if (!phoneReg.test(contactPhone)) {
      wx.showToast({ title: '请输入正确的手机号', icon: 'none' });
      return false;
    }

    if (!detail.trim()) {
      wx.showToast({ title: '请输入详细地址', icon: 'none' });
      return false;
    }

    return true;
  }
});
