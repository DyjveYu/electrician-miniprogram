// pages/electrician/list/list.js
Page({
  data: {
    electricians: [],
    loading: false,
    hasMore: true,
    page: 1,
    pageSize: 10
  },

  onLoad() {
    this.loadElectricians();
  },

  onPullDownRefresh() {
    this.refreshElectricians();
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadMoreElectricians();
    }
  },

  // 刷新电工列表
  refreshElectricians() {
    this.setData({
      electricians: [],
      page: 1,
      hasMore: true
    });
    this.loadElectricians();
  },

  // 加载电工列表
  loadElectricians() {
    if (this.data.loading) return;
    
    this.setData({ loading: true });
    
    const app = getApp();
    
    // 获取用户位置信息（如果有的话）
    wx.getLocation({
      type: 'gcj02',
      success: (location) => {
        this.requestElectricianList(location.latitude, location.longitude);
      },
      fail: () => {
        // 如果获取位置失败，使用默认位置
        this.requestElectricianList(39.9042, 116.4074); // 北京天安门坐标
      }
    });
  },

  // 请求电工列表数据
  requestElectricianList(latitude, longitude) {
    const app = getApp();
    wx.request({
      url: `${app.globalData.baseUrl}/system/nearby-electricians`,
      method: 'GET',
      header: {
        'Authorization': app.globalData.token ? `Bearer ${app.globalData.token}` : ''
      },
      data: {
        latitude: latitude,
        longitude: longitude,
        distance: 10000 // 10公里范围
      },
      success: (res) => {
        wx.stopPullDownRefresh();
        this.setData({ loading: false });
        
        if (res.data.code === 200) {
          const electricianData = res.data.data.electricians || [];
          // 数据字段映射和格式化
          const formattedElectricians = electricianData.map(item => ({
            id: item.id,
            name: item.nickname || item.real_name || '未知电工',
            phone: item.phone,
            avatar: item.avatar,
            rating: item.avg_rating ? parseFloat(item.avg_rating).toFixed(1) : null,
            experience: item.experience_years || 0,
            serviceCount: item.completed_orders || 0,
            skills: [], // 暂时为空，后续可以从其他接口获取
            location: '附近', // 简化显示
            certificateNumber: item.certificate_number
          }));
          
          this.setData({
            electricians: this.data.page === 1 ? formattedElectricians : this.data.electricians.concat(formattedElectricians),
            hasMore: formattedElectricians.length === this.data.pageSize
          });
        } else {
          wx.showToast({ title: res.data.message || '加载失败', icon: 'none' });
        }
      },
      fail: () => {
        wx.stopPullDownRefresh();
        this.setData({ loading: false });
        wx.showToast({ title: '网络错误，请稍后重试', icon: 'none' });
      }
    });
  },

  // 加载更多电工
  loadMoreElectricians() {
    this.setData({ page: this.data.page + 1 });
    this.loadElectricians();
  },

  // 查看电工详情
  viewElectricianDetail(e) {
    const electricianId = e.currentTarget.dataset.id;
    const electrician = this.data.electricians.find(item => item.id == electricianId);
    
    if (electrician) {
      // 保存电工列表到本地存储，供详情页面使用
      try {
        wx.setStorageSync('electricianList', this.data.electricians);
      } catch (e) {
        console.error('保存电工列表失败:', e);
      }
      
      // 传递电工数据到详情页面
      const electricianData = encodeURIComponent(JSON.stringify(electrician));
      wx.navigateTo({
        url: `/pages/electrician/detail/detail?id=${electricianId}&electricianData=${electricianData}`
      });
    } else {
      wx.navigateTo({
        url: `/pages/electrician/detail/detail?id=${electricianId}`
      });
    }
  },

  // 联系电工
  contactElectrician(e) {
    const phone = e.currentTarget.dataset.phone;
    wx.makePhoneCall({
      phoneNumber: phone
    });
  }
});