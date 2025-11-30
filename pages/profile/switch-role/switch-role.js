// pages/profile/switch-role/switch-role.js
Page({
  data: {
    currentRole: 'user',
    userInfo: null,
    roles: [
      {
        id: 'user',
        name: '用户',
        desc: '发布维修需求，寻找专业电工',
        icon: '👤',
        features: ['发布订单', '选择电工', '在线支付', '服务评价']
      },
      {
        id: 'electrician',
        name: '电工',
        desc: '接单赚钱，提供专业电工服务',
        icon: '🔧',
        features: ['接单赚钱', '展示技能', '客户评价', '收入统计'],
        requireCertification: true
      }
    ]
  },

  onLoad() {
    this.loadUserInfo();
  },

  onShow() {
    this.loadUserInfo();
  },

  // 加载用户信息
  loadUserInfo() {
    const app = getApp();
    this.setData({
      currentRole: app.globalData.currentRole,
      userInfo: app.globalData.userInfo
    });
  },

  // 选择角色
  selectRole(e) {
    const roleId = e.currentTarget.dataset.role;
    
    if (roleId === this.data.currentRole) {
      return; // 已经是当前角色
    }
    
    if (roleId === 'electrician') {
      // 切换到电工角色需要验证认证状态
      this.switchToElectrician();
    } else {
      // 切换到用户角色
      this.switchToUser();
    }
  },

  // 切换到电工角色
  switchToElectrician() {
    if (!this.data.userInfo || !this.data.userInfo.isElectrician) {
      // 未认证，提示去认证
      wx.showModal({
        title: '需要电工认证',
        content: '切换到电工角色需要先完成电工认证，是否前往认证？',
        success: (res) => {
          if (res.confirm) {
            wx.navigateTo({
              url: '/pages/profile/certification/certification?mode=apply'
            });
          }
        }
      });
      return;
    }
    
    // 已认证，直接切换
    this.performRoleSwitch('electrician');
  },

  // 切换到用户角色
  switchToUser() {
    this.performRoleSwitch('user');
  },

  // 执行角色切换
  performRoleSwitch(role) {
    const app = getApp();
    
    wx.showLoading({ title: '切换中...' });
    
    // 更新全局角色
    app.switchRole(role);
    
    setTimeout(() => {
      wx.hideLoading();
      
      this.setData({ currentRole: role });
      
      wx.showToast({
        title: `已切换到${role === 'electrician' ? '电工' : '用户'}模式`,
        icon: 'success'
      });
      
      // 延迟返回，让用户看到切换成功的提示
      setTimeout(() => {
        wx.switchTab({
          url: '/pages/index/index'
        });
      }, 1500);
    }, 1000);
  },

  // 前往认证
  goToCertification() {
    wx.navigateTo({
      url: '/pages/profile/certification/certification?mode=apply'
    });
  }
});