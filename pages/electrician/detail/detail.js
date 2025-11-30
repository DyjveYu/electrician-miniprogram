// pages/electrician/detail/detail.js
Page({
  data: {
    electricianId: '',
    electrician: null,
    loading: false
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ electricianId: options.id });
      
      // 尝试从页面参数中获取电工信息
      if (options.electricianData) {
        try {
          const electricianData = JSON.parse(decodeURIComponent(options.electricianData));
          this.setElectricianData(electricianData);
        } catch (e) {
          console.error('解析电工数据失败:', e);
          this.loadElectricianFromStorage();
        }
      } else {
        this.loadElectricianFromStorage();
      }
    }
  },

  // 设置电工数据并进行字段映射
  setElectricianData(data) {
    const electrician = {
      id: data.id,
      name: data.name || data.nickname || data.real_name || '未知电工',
      phone: data.phone,
      avatar: data.avatar,
      rating: data.rating,
      experience: data.experience || 0,
      serviceCount: data.serviceCount || 0,
      completionRate: 95, // 默认完成率
      skills: data.skills || ['电路维修', '开关插座', '灯具安装'], // 默认技能
      description: '专业电工，经验丰富，服务周到，价格合理。', // 默认描述
      certificateNumber: data.certificateNumber || '暂无',
      certificateExpiry: '长期有效', // 默认有效期
      serviceArea: '本地及周边地区' // 默认服务区域
    };
    
    this.setData({ 
      electrician: electrician,
      loading: false 
    });
  },

  // 从本地存储加载电工信息（备用方案）
  loadElectricianFromStorage() {
    try {
      const electricianList = wx.getStorageSync('electricianList') || [];
      const electrician = electricianList.find(item => item.id == this.data.electricianId);
      
      if (electrician) {
        this.setElectricianData(electrician);
      } else {
        // 如果找不到数据，显示默认信息
        this.setData({
          electrician: {
            id: this.data.electricianId,
            name: '电工师傅',
            phone: '',
            avatar: '',
            rating: null,
            experience: 0,
            serviceCount: 0,
            completionRate: 0,
            skills: [],
            description: '暂无详细信息',
            certificateNumber: '暂无',
            certificateExpiry: '暂无',
            serviceArea: '暂无'
          },
          loading: false
        });
      }
    } catch (e) {
      console.error('从存储加载电工信息失败:', e);
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  // 联系电工
  contactElectrician() {
    if (this.data.electrician && this.data.electrician.phone) {
      wx.makePhoneCall({
        phoneNumber: this.data.electrician.phone
      });
    }
  },

  // 预览头像
  previewAvatar() {
    if (this.data.electrician && this.data.electrician.avatar) {
      wx.previewImage({
        urls: [this.data.electrician.avatar]
      });
    }
  }
});