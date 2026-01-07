// pages/login/login.js
const app = getApp();
const { AuthAPI } = require('../../utils/api');
const { validatePhone } = require('../../utils/util');

Page({
  data: {
    phone: '',
    code: '',
    phoneError: '',
    codeError: '',
    canSendCode: false,
    canLogin: false,
    codeButtonText: '获取验证码',
    loginButtonText: '登录',
    countdown: 0,
    isLogging: false,
    showTestTip: false,
    testCode: '',
    selectedRole: 'electrician', // 默认选择电工角色 user
    isAgreed: false, // 是否同意协议

    // 弹窗相关
    showModal: false,
    modalTitle: '',
    modalContent: ''
  },

  onLoad() {
    console.log('登录页面加载');
    console.log('初始 selectedRole:', this.data.selectedRole);
    this.checkTestEnvironment();
  },

  onShow() {
    console.log('[登录页] 页面显示');

    // 延迟检查登录状态,确保app.js初始化完成
    setTimeout(() => {
      const app = getApp();
      console.log('[登录页] 检查登录状态:', {
        isLogin: app.globalData.isLogin,
        token: app.globalData.token ? '存在' : '不存在'
      });

      // 如果已经登录,直接返回首页
      if (app.globalData.isLogin && app.globalData.token) {
        console.log('[登录页] 已登录,跳转到首页');
        wx.reLaunch({
          url: '/pages/index/index'
        });
      }
    }, 100);
  },

  /**
   * 检查测试环境
   */
  checkTestEnvironment() {
    // 在开发环境显示测试提示
    const isTestEnv = app.globalData.baseUrl.includes('localhost');
    this.setData({
      showTestTip: isTestEnv,
      testCode: '123456'
    });
  },

  /**
   * 选择角色
   */
  selectRole(e) {
    const role = e.currentTarget.dataset.role;
    console.log('选择角色:', role);
    /*临时功能 1月6日
    if (role === 'user') {
      wx.showToast({
        title: '功能开发中，敬请期待',
        icon: 'none',
        duration: 2000
      });
      return;
    }
    */
    this.setData({
      selectedRole: role
    });
    console.log('当前 selectedRole:', this.data.selectedRole);
  },

  /**
   * 切换协议勾选状态
   */
  toggleAgreement() {
    this.setData({
      isAgreed: !this.data.isAgreed
    });
    this.validateForm();
  },

  /**
   * 手机号输入
   */
  onPhoneInput(e) {
    const phone = e.detail.value;
    this.setData({
      phone,
      phoneError: ''
    });
    this.validateForm();
  },

  /**
   * 验证码输入
   */
  onCodeInput(e) {
    const code = e.detail.value;
    this.setData({
      code,
      codeError: ''
    });
    this.validateForm();
  },

  /**
   * 验证表单
   */
  validateForm() {
    const { phone, code, isAgreed } = this.data;

    // 验证手机号
    const canSendCode = validatePhone(phone);

    // 验证登录条件
    const canLogin = canSendCode && code.length === 6 && isAgreed;

    this.setData({
      canSendCode,
      canLogin
    });
  },

  /**
   * 发送验证码
   */
  async sendCode() {
    if (!this.data.canSendCode || this.data.countdown > 0) {
      return;
    }

    const { phone } = this.data;

    // 验证手机号
    if (!validatePhone(phone)) {
      this.setData({
        phoneError: '请输入正确的手机号'
      });
      return;
    }

    try {
      app.showLoading('发送中...');

      const res = await AuthAPI.sendCode(phone, 'login');

      app.showToast('验证码发送成功', 'success');

      // 开始倒计时
      this.startCountdown();

      // 测试环境显示验证码
      if (res.code) {
        this.setData({
          testCode: res.code
        });
      }
    } catch (error) {
      app.showToast(error.message || '发送失败');
    } finally {
      app.hideLoading();
    }
  },

  /**
   * 开始倒计时
   */
  startCountdown() {
    let countdown = 60;
    this.setData({
      countdown,
      codeButtonText: `${countdown}s后重发`
    });

    const timer = setInterval(() => {
      countdown--;
      if (countdown <= 0) {
        clearInterval(timer);
        this.setData({
          countdown: 0,
          codeButtonText: '获取验证码'
        });
      } else {
        this.setData({
          countdown,
          codeButtonText: `${countdown}s后重发`
        });
      }
    }, 1000);
  },

  /**
   * 登录
   */
  async login() {
    if (!this.data.canLogin || this.data.isLogging) {
      return;
    }

    const { phone, code } = this.data;

    // 验证手机号
    if (!validatePhone(phone)) {
      this.setData({
        phoneError: '请输入正确的手机号'
      });
      return;
    }

    // 验证验证码
    if (code.length !== 6) {
      this.setData({
        codeError: '请输入6位验证码'
      });
      return;
    }

    try {
      this.setData({
        isLogging: true,
        loginButtonText: '登录中...'
      });

      // 1. 尝试获取 OpenID (静默获取)
      let openid = '';
      try {
        console.log('正在获取微信登录凭证...');
        const wxLoginRes = await wx.login();
        if (wxLoginRes.code) {
           console.log('获取到微信 code:', wxLoginRes.code);
           const sessionRes = await AuthAPI.code2Session(wxLoginRes.code);
           console.log('code2session 响应:', sessionRes);
           if (sessionRes && (sessionRes.code === 0 || sessionRes.code === 200) && sessionRes.data && sessionRes.data.openid) {
             openid = sessionRes.data.openid;
             console.log('成功获取 OpenID:', openid);
           }
        }
      } catch (err) {
        console.error('获取 OpenID 失败，将尝试不带 OpenID 登录:', err);
      }

      // 传递角色选择给后端
      console.log('准备登录，选择的角色:', this.data.selectedRole, 'OpenID:', openid);
      const res = await AuthAPI.login(phone, code, this.data.selectedRole, openid);

      console.log('登录API响应:', res);

      // 保存登录信息
      app.login(res.data.user, res.data.token);

      app.showToast('登录成功');

      // 延迟跳转，让用户看到成功提示
      setTimeout(() => {
        console.log('登录成功，准备跳转到首页');
        console.log('当前全局数据:', app.globalData);

        // 使用reLaunch确保完全重新加载首页
        wx.reLaunch({
          url: '/pages/index/index',
          success: () => {
            console.log('跳转到首页成功');
          },
          fail: (err) => {
            console.error('跳转到首页失败:', err);
            // 如果reLaunch失败，尝试switchTab
            wx.switchTab({
              url: '/pages/index/index',
              success: () => {
                console.log('switchTab跳转成功');
              },
              fail: (switchErr) => {
                console.error('switchTab也失败了:', switchErr);
              }
            });
          }
        });
      }, 1500);
    } catch (error) {
      app.showToast(error.message || '登录失败');
      this.setData({
        isLogging: false,
        loginButtonText: '登录'
      });
    }
  },

  /**
   * 微信登录
   */
  async wechatLogin() {
    try {
      // 获取微信登录授权
      const loginRes = await new Promise((resolve, reject) => {
        wx.login({
          success: resolve,
          fail: reject
        });
      });

      if (!loginRes.code) {
        throw new Error('获取微信授权失败');
      }

      // 获取用户信息授权
      const userInfoRes = await new Promise((resolve, reject) => {
        wx.getUserProfile({
          desc: '用于完善用户资料',
          success: resolve,
          fail: reject
        });
      });

      console.log('微信登录信息:', {
        code: loginRes.code,
        userInfo: userInfoRes.userInfo
      });

      // 这里应该调用后端接口进行微信登录
      // 暂时显示提示
      app.showToast('微信登录功能开发中');
    } catch (error) {
      console.error('微信登录失败:', error);
      if (error.errMsg && error.errMsg.includes('getUserProfile:fail auth deny')) {
        app.showToast('需要授权才能使用微信登录');
      } else {
        app.showToast('微信登录失败');
      }
    }
  },

  /**
   * 显示隐私政策
   */
  showPrivacyPolicy() {
    this.setData({
      showModal: true,
      modalTitle: '隐私政策',
      modalContent: `感谢您使用电工维修平台！我们非常重视您的隐私保护。本隐私政策说明了我们如何收集、使用、存储和保护您的个人信息。

1. 信息收集
我们可能收集以下信息：
- 基本信息：姓名、手机号码、头像等
- 位置信息：用于匹配附近的电工服务
- 设备信息：设备型号、操作系统等

2. 信息使用
我们使用收集的信息用于：
- 提供电工维修服务
- 改善用户体验
- 客户服务支持

3. 信息保护
我们采用行业标准的安全措施保护您的个人信息，包括数据加密、访问控制等。

4. 信息共享
除法律要求外，我们不会向第三方分享您的个人信息。

如有疑问，请联系客服：13552949114`
    });
  },

  /**
   * 显示用户协议
   */
  showUserAgreement() {
    this.setData({
      showModal: true,
      modalTitle: '用户协议',
      modalContent: `欢迎使用电工维修平台！请仔细阅读本用户协议。

1. 服务说明
电工维修平台是一个连接用户和电工的服务平台，为用户提供电工维修服务预约和管理功能。

2. 用户责任
- 提供真实、准确的个人信息
- 遵守平台使用规范
- 不得发布虚假信息
- 按时支付服务费用

3. 平台责任
- 提供稳定的平台服务
- 保护用户隐私信息
- 协助解决服务纠纷

4. 服务费用
平台服务费用按照公示标准收取，具体费用在下单时显示。

5. 免责声明
平台仅提供信息撮合服务，对于服务质量问题，平台将协助解决但不承担直接责任。

6. 协议修改
平台有权根据业务需要修改本协议，修改后的协议将在平台公布。

如有疑问，请联系客服：13552949114`
    });
  },

  /**
   * 隐藏弹窗
   */
  hideModal() {
    this.setData({
      showModal: false
    });
  }
});