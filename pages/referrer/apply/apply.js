// pages/referrer/apply/apply.js
const app = getApp();
const { AuthAPI, API } = require('../../../utils/api');
const { validatePhone } = require('../../../utils/util');

Page({
  data: {
    name: '',
    phone: '',
    code: '',
    canSendCode: false,
    canSubmit: false,
    codeButtonText: '获取验证码',
    countdown: 0,
    submitting: false,
    errorMsg: '',
    showSuccessModal: false
  },

  onLoad(options) {
    // scene 参数保留用于后续追踪来源
    console.log('推荐达人申请页加载，scene:', options.scene);
  },

  // ─── 输入处理 ───

  onNameInput(e) {
    this.setData({ name: e.detail.value, errorMsg: '' });
    this.validateForm();
  },

  onPhoneInput(e) {
    this.setData({ phone: e.detail.value, errorMsg: '' });
    this.validateForm();
  },

  onCodeInput(e) {
    this.setData({ code: e.detail.value, errorMsg: '' });
    this.validateForm();
  },

  // ─── 表单验证 ───

  validateForm() {
    const { name, phone, code } = this.data;
    const canSendCode = validatePhone(phone);
    const canSubmit = name.trim().length > 0 && canSendCode && code.length === 6;
    this.setData({ canSendCode, canSubmit });
  },

  // ─── 发送验证码 ───

  async sendCode() {
    if (!this.data.canSendCode || this.data.countdown > 0) return;

    const { phone } = this.data;
    if (!validatePhone(phone)) {
      this.setData({ errorMsg: '请输入正确的手机号' });
      return;
    }

    try {
      wx.showLoading({ title: '发送中...', mask: true });
      await AuthAPI.sendCode(phone, 'login');
      wx.showToast({ title: '验证码发送成功', icon: 'success' });
      this.startCountdown();
    } catch (err) {
      this.setData({ errorMsg: err.message || '发送失败' });
    } finally {
      wx.hideLoading();
    }
  },

  startCountdown() {
    let countdown = 60;
    this.setData({ countdown, codeButtonText: `${countdown}s后重发` });
    const timer = setInterval(() => {
      countdown--;
      if (countdown <= 0) {
        clearInterval(timer);
        this.setData({ countdown: 0, codeButtonText: '获取验证码' });
      } else {
        this.setData({ countdown, codeButtonText: `${countdown}s后重发` });
      }
    }, 1000);
  },

  // ─── 提交申请 ───

  async submitApply() {
    if (!this.data.canSubmit || this.data.submitting) return;

    const { name, phone, code } = this.data;

    // 1. 校验姓名
    if (!name.trim()) {
      this.setData({ errorMsg: '请输入姓名' });
      return;
    }

    // 2. 校验手机号
    if (!validatePhone(phone)) {
      this.setData({ errorMsg: '请输入正确的手机号' });
      return;
    }

    // 3. 校验验证码
    if (code.length !== 6) {
      this.setData({ errorMsg: '请输入6位验证码' });
      return;
    }

    this.setData({ submitting: true, errorMsg: '' });

    try {
      // 第一步：登录（短信验证码方式），获取 JWT token
      const loginRes = await AuthAPI.login(phone, code);
      if (loginRes.data && loginRes.data.token && loginRes.data.user) {
        app.login(loginRes.data.user, loginRes.data.token);
      }

      // 第二步：携带 token 提交推荐达人申请
      const applyRes = await API.post('/miniprogram/referrer/apply', { name: name.trim() });

      if (applyRes.code === 0 || applyRes.code === 200) {
        this.setData({ showSuccessModal: true });
      } else {
        this.setData({ errorMsg: applyRes.message || '提交失败，请稍后重试' });
      }
    } catch (err) {
      // 409 冲突：已有待审核申请 / 已是推荐达人
      this.setData({ errorMsg: err.message || '提交失败，请稍后重试' });
    } finally {
      this.setData({ submitting: false });
    }
  },

  // ─── 成功弹窗 ───

  closeSuccessModal() {
    this.setData({ showSuccessModal: false });
    // 返回首页
    wx.switchTab({ url: '/pages/index/index' });
  }
});
