// 身份转换由手机号登录入口和服务端校验，不在客户端改角色。
Page({
  data: {
    currentRole: 'user', userInfo: null,
    roles: [
      { id: 'user', name: '用户', desc: '发布维修需求，寻找专业电工', icon: '👤', features: ['发布订单', '在线支付', '服务评价'] },
      { id: 'electrician', name: '电工', desc: '通过手机号注册登录办理身份转换', icon: '🔧', features: ['身份转换须处理完原订单及佣金', '转换后原下单身份停用'] }
    ]
  },
  onLoad() { this.loadUserInfo(); },
  onShow() { this.loadUserInfo(); },
  loadUserInfo() {
    const app = getApp();
    this.setData({ currentRole: app.globalData.currentRole, userInfo: app.globalData.userInfo });
  },
  selectRole(e) {
    const role = e.currentTarget.dataset.role;
    if (!['user', 'electrician'].includes(role) || role === this.data.currentRole) return;
    if (role === 'electrician') this.switchToElectrician();
    else this.switchToUser();
  },
  switchToElectrician() { getApp().switchRole('electrician'); },
  switchToUser() { getApp().showToast('电工身份不能切回原下单身份'); },
  performRoleSwitch(role) { getApp().switchRole(role); },
  goToCertification() { wx.navigateTo({ url: '/pages/profile/certification/certification?mode=apply' }); }
});
