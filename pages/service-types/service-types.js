// pages/service-types/service-types.js
Page({
  data: {
    serviceTypes: [
      {
        id: 1,
        name: '电路维修',
        icon: '🔌',
        desc: '家庭电路故障检修、线路改造',
        price: '50-200元',
        features: ['断电检修', '线路改造', '电路安装', '故障排查']
      },
      {
        id: 2,
        name: '开关插座',
        icon: '🔘',
        desc: '开关插座安装、更换、维修',
        price: '30-100元',
        features: ['开关安装', '插座更换', '面板维修', '接线处理']
      },
      {
        id: 3,
        name: '灯具安装',
        icon: '💡',
        desc: '各类灯具安装、维修、更换',
        price: '40-150元',
        features: ['吊灯安装', '射灯安装', '灯具维修', '调光设置']
      },
      {
        id: 4,
        name: '电器维修',
        icon: '🔧',
        desc: '家用电器故障维修',
        price: '80-300元',
        features: ['家电维修', '电机维修', '控制器维修', '电源维修']
      },
      {
        id: 5,
        name: '弱电工程',
        icon: '📡',
        desc: '网络布线、监控安装等弱电工程',
        price: '100-500元',
        features: ['网络布线', '监控安装', '门禁系统', '音响系统']
      },
      {
        id: 6,
        name: '其他电工服务',
        icon: '⚡',
        desc: '其他电工相关服务',
        price: '面议',
        features: ['电工咨询', '安全检查', '应急维修', '定制服务']
      }
    ]
  },

  onLoad() {
    // 页面加载
  },

  // 选择服务类型
  selectServiceType(e) {
    const serviceType = e.currentTarget.dataset.service;
    
    // 返回到下单页面
    const pages = getCurrentPages();
    const prevPage = pages[pages.length - 2];
    
    if (prevPage && prevPage.route === 'pages/order/create/create') {
      prevPage.setData({ selectedServiceType: serviceType });
      wx.navigateBack();
    } else {
      // 直接跳转到下单页面
      wx.navigateTo({
        url: `/pages/order/create/create?serviceTypeId=${serviceType.id}`
      });
    }
  }
});