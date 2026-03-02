// pages/profile/profile/profile.js
Page({
  data: {
    userInfo: null,
    currentRole: 'user',
    electricianInfo: null,
    menuItems: [
      {
        id: 'address',
        title: '地址管理',
        icon: '📍',
        url: '/pages/address/list/list',
        showForRole: ['user']
      },
      {
        id: 'certification',
        title: '电工认证',
        icon: '🔧',
        url: '/pages/profile/certification/certification',
        showForRole: ['user', 'electrician']
      },
      {
        id: 'edit',
        title: '编辑资料',
        icon: '✏️',
        url: '/pages/profile/edit/edit',
        showForRole: ['user', 'electrician']
      },
      {
        id: 'switch-role',
        title: '角色切换',
        icon: '🔄',
        url: '/pages/profile/switch-role/switch-role',
        showForRole: ['user', 'electrician']
      },
      {
        id: 'settings',
        title: '设置',
        icon: '⚙️',
        url: '/pages/profile/settings/settings',
        showForRole: ['user', 'electrician']
      }
    ],
    stats: {
      totalOrders: 0,
      completedOrders: 0,
      totalAmount: 0,
      rating: 0
    }
  },
  // 页面加载时：初始化时加载一次用户信息
  onLoad() {
    this.loadUserInfo();
  },
  //页面重新显示时，每次从其他页面返回时刷新数据
  onShow() {
    // 页面显示时刷新数据
    this.loadUserInfo();
  },

  // 用户下拉刷新时
  onPullDownRefresh() {
    this.loadUserInfo();
  },

  // 加载用户信息（替换现有函数）
loadUserInfo() {
  const app = getApp();

  // 检查登录
  if (!app.globalData.token) {
    console.log('用户未登录，跳转到登录页');
    setTimeout(() => {
      wx.reLaunch({ url: '/pages/login/login' });
    }, 100);
    return;
  }

  // 如果有全局缓存，先展示（非必须，但可提升体验）
  if (app.globalData.userInfo) {
    this.setData({
      userInfo: app.globalData.userInfo,
      currentRole: app.globalData.currentRole
    });
  }

  // 发请求获取最新数据
  wx.request({
    url: `${app.globalData.baseUrl}/auth/userinfo`,
    method: 'GET',
    header: { 'Authorization': `Bearer ${app.globalData.token}` },
    success: (res) => {
      wx.stopPullDownRefresh();
      const data = res.data;
      console.log('auth/userinfo 返回：', data);

      if (data && (data.code === 0 || data.code === 200 || data.success === true)) {
        const userInfo = data.data.user || {};
        const stats = data.data.stats || {};

        // 状态映射（前端展示用）
        const statusMap = {
          unverified: '未认证',
          pending: '认证中',
          approved: '已认证',
          rejected: '已驳回'
        };

        // 统一字段名 / 回退：避免 nickname 为 null 导致显示异常
        //（这里不改后端字段，只保证页面显示稳定）
        // 获取认证信息中的真实姓名
        const certification = data.data.certification || {};
        const normalizedUserInfo = {
          ...userInfo,
          nickname: (userInfo.nickname === null || userInfo.nickname === undefined) ? '' : userInfo.nickname,
          real_name: certification.real_name || '', // 电工认证的真实姓名
          // 保持 phone、avatar 等原样
        };

        // 更新页面数据（合并一次 setData）
        this.setData({
          userInfo: normalizedUserInfo,
          currentRole: app.globalData.currentRole || normalizedUserInfo.current_role || 'user',
          electricianInfo: data.data.certification || null,
          certificationStatusText: statusMap[normalizedUserInfo.certificationStatus] || '未认证',
          stats: {
            totalOrders: stats.total_orders || 0,
            completedOrders: stats.completed_orders || 0,
            totalAmount: app.globalData.currentRole === 'user' ? (stats.total_spent || 0) : (stats.total_earned || 0),
            rating: 0
          }
        });

        // 同步到全局（以后其它页面读取）
        app.globalData.userInfo = normalizedUserInfo;
        app.globalData.currentRole = this.data.currentRole;

        // 如果用户处于电工角色，可加载收入/钱包信息
        if (this.data.currentRole === 'electrician') {
          this.loadWalletInfo();
        }
      } else if (data && data.code === 401) {
        // token无效
        app.logout();
      } else {
        console.warn('获取用户信息失败：', data && data.message);
        wx.showToast({ title: data && data.message ? data.message : '获取用户信息失败', icon: 'none' });
      }
    },
    fail: (err) => {
      wx.stopPullDownRefresh();
      console.error('获取用户信息失败：', err);
      wx.showToast({ title: '网络连接失败', icon: 'none' });
    }
  });
},

  // 加载钱包信息
  loadWalletInfo() {
    const app = getApp();
    
    wx.request({
      url: `${app.globalData.baseUrl}/electricians/income`,
      method: 'GET',
      header: {
        'Authorization': `Bearer ${app.globalData.token}`
      },
      success: (res) => {
        if (res.data.success) {
          const incomeData = res.data.data || {};
          const total = Number(incomeData.total_income || 0);
          const withdrawn = Number(incomeData.withdrawn_amount || 0);
          const balance = Number(incomeData.available_balance != null ? incomeData.available_balance : (total - withdrawn));
          console.log('[ElectricianIncomeCalc] 总收入(total_income):', total,
            '已提现(withdrawn_amount):', withdrawn,
            '可提现余额(available_balance):', balance,
            '计算: available = total - withdrawn');
          this.setData({ wallet: incomeData });
        }
      },
      fail: () => {
        console.log('获取钱包信息失败');
      }
    });
  },

  // 跳转到提现页面
  navigateToWallet() {
    wx.navigateTo({
      url: '/pages/wallet/withdraw/withdraw'
    });
  },



  // 点击菜单项
  onMenuItemTap(e) {
    const item = e.currentTarget.dataset.item;
    
    if (item.id === 'certification') {
      // 电工认证特殊处理
      this.handleCertification();
    } else {
      wx.navigateTo({
        url: item.url
      });
    }
  },

  // 处理电工认证
 handleCertification() {
  const userInfo = this.data.userInfo || {};
  const status = userInfo.certificationStatus || 'unverified';

  // 逻辑：已认证（approved）去查看；审核中/未认证/驳回，进入申请页面（apply）
  if (status === 'approved') {
    wx.navigateTo({ url: '/pages/profile/certification/certification?mode=view' });
  } else {
    // 如果想把 rejected 显示为查看但允许重新申请，也可改为不同路径
    wx.navigateTo({ url: '/pages/profile/certification/certification?mode=apply' });
  }
},

  // 查看头像
  previewAvatar() {
    if (this.data.userInfo && this.data.userInfo.avatar) {
      wx.previewImage({
        urls: [this.data.userInfo.avatar]
      });
    }
  },

  // 退出登录
  logout() {
    wx.showModal({
      title: '确认退出',
      content: '确定要退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          const app = getApp();
          app.logout();
        }
      }
    });
  },

  // 过滤菜单项
  getFilteredMenuItems() {
    const currentRole = this.data.currentRole;
    return this.data.menuItems.filter(item => 
      item.showForRole.includes(currentRole)
    );
  },

  // 获取认证状态文本
  getCertificationStatusText() {
    if (!this.data.userInfo) return '未认证';
    
    if (this.data.userInfo.isElectrician) {
      return '已认证';
    } else if (this.data.userInfo.certificationStatus === 'pending') {
      return '审核中';
    } else if (this.data.userInfo.certificationStatus === 'rejected') {
      return '审核未通过';
    } else {
      return '未认证';
    }
  },

  // 获取角色显示文本
  getRoleText() {
    return this.data.currentRole === 'electrician' ? '电工' : '用户';
  },

  // 导航到编辑资料页面
  navigateToEdit() {
    wx.navigateTo({
      url: '/pages/profile/edit/edit'
    });
  },

  // 导航到角色切换页面
  navigateToSwitchRole() {
    wx.navigateTo({
      url: '/pages/profile/switch-role/switch-role'
    });
  },

  // 导航到设置页面
  navigateToSettings() {
    wx.showToast({
      title: '功能开发中',
      icon: 'none'
    });
  },

  // 导航到关于页面
  navigateToAbout() {
    wx.showToast({
      title: '功能开发中',
      icon: 'none'
    });
  }
});
