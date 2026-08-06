// pages/enterprise/certification/certification.js
const app = getApp();

// 实时日志封装（无需额外依赖文件，直接内联）
const rtLog = wx.getRealtimeLogManager ? wx.getRealtimeLogManager() : null;
const log = {
  info(...args) { rtLog && rtLog.info.apply(rtLog, args); },
  warn(...args) { rtLog && rtLog.warn.apply(rtLog, args); },
  error(...args) { rtLog && rtLog.error.apply(rtLog, args); }
};

Page({
  data: {
    mode: 'apply', // apply: 申请认证, view: 查看认证
    formData: {
      companyName: '',
      creditCode: '',
      addressDetail: '',
      contactName: '',
      contactPhone: ''
    },
    certStatus: '', // pending: 认证中, approved: 已认证
    submitDisabled: true,
    region: ['', '', ''],
    customItem: '全部',
    licenseImagePath: '',
    submitting: false
  },

  onLoad(options) {
    if (options.mode) {
      this.setData({ mode: options.mode });
    }

    // 手机号自动从登录信息带出，不可修改
    if (app.globalData.userInfo && app.globalData.userInfo.phone) {
      this.setData({
        'formData.contactPhone': app.globalData.userInfo.phone
      });
    }

    // 提前获取网络类型，供后续上传失败时一并上报
    wx.getNetworkType({
      success: (res) => {
        this._networkType = res.networkType;
      }
    });

    // 查看模式加载认证信息
    if (this.data.mode === 'view') {
      this.loadCertificationInfo();
    }
  },

  onShow() {
    // 每次显示时刷新认证信息
    this.loadCertificationInfo();
  },

  // 加载企业认证信息
  loadCertificationInfo() {
    wx.showLoading({ title: '加载中' });

    wx.request({
      url: `${app.globalData.baseUrl}/miniprogram/enterprise/certification`,
      method: 'GET',
      header: {
        'Authorization': `Bearer ${app.globalData.token}`
      },
      success: (res) => {
        const ok = res?.data?.success === true || res?.data?.code === 0 || res?.data?.code === 200;
        if (ok) {
          const data = res?.data?.data || {};
          // 如果有认证记录，填充表单并切换到查看模式
          if (data && data.certStatus) {
            this.setData({
              mode: 'view',
              certStatus: data.certStatus,
              formData: {
                companyName: data.companyName || '',
                creditCode: data.creditCode || '',
                addressDetail: data.address || '',
                contactName: data.contactName || '',
                contactPhone: data.contactPhone || this.data.formData.contactPhone
              },
              region: [
                data.province || '',
                data.city || '',
                data.district || ''
              ],
              licenseImagePath: data.licenseImage || ''
            }, () => {
              this.checkFormValid();
            });
          } else {
            // 无认证记录，保持申请模式
            this.setData({ mode: 'apply', certStatus: '' });
          }
        } else {
          log.warn('load_certification_biz_fail', {
            code: res?.data?.code,
            message: res?.data?.message
          });
        }
      },
      fail: (err) => {
        log.error('load_certification_fail', { errMsg: err.errMsg });
        wx.showToast({ title: '加载失败', icon: 'none' });
      },
      complete: () => {
        wx.hideLoading();
      }
    });
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

  // 省市区选择器变更
  bindRegionChange(e) {
    this.setData({
      region: e.detail.value
    });

    this.checkFormValid();
  },

  // 选择营业执照图片
  chooseLicenseImage() {
    if (this.data.mode === 'view' && this.data.certStatus !== 'approved') {
      wx.showToast({ title: '认证中不可修改', icon: 'none' });
      return;
    }

    const that = this;
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success(res) {
        const tempFilePath = res.tempFilePaths[0];
        that.setData({
          licenseImagePath: tempFilePath
        });
        that.checkFormValid();
      },
      fail(err) {
        // 用户主动取消不算异常，不需要打扰用户/上报
        if (err.errMsg && err.errMsg.indexOf('cancel') !== -1) {
          return;
        }
        log.warn('choose_license_image_fail', { errMsg: err.errMsg });
        wx.showToast({ title: '获取图片失败，请检查相册/相机权限', icon: 'none' });
      }
    });
  },

  // 预览营业执照图片
  previewLicenseImage() {
    const path = this.data.licenseImagePath;
    if (!path) return;

    let url = path;
    if (path.startsWith('/uploads/')) {
      url = app.globalData.imageBaseUrl + path;
    }

    wx.previewImage({
      urls: [url]
    });
  },

  // 检查表单是否有效
  checkFormValid() {
    const { formData } = this.data;

    const isValid =
      formData.companyName &&
      formData.companyName.trim().length > 0 &&
      formData.creditCode &&
      formData.creditCode.trim().length === 18 &&
      this.data.region[0] &&
      this.data.region[1] &&
      this.data.region[2] &&
      formData.addressDetail &&
      formData.addressDetail.trim().length > 0 &&
      formData.contactName &&
      formData.contactName.trim().length > 0 &&
      this.data.licenseImagePath;

    this.setData({
      submitDisabled: !isValid
    });
  },

  // 上传营业执照图片（返回相对路径）
  uploadLicenseImage(filePath) {
    return new Promise((resolve, reject) => {
      if (!filePath || typeof filePath !== 'string') {
        reject(new Error('图片路径无效'));
        return;
      }

      // 如果已经是相对路径，直接返回
      if (filePath.startsWith('/uploads/')) {
        resolve(filePath);
        return;
      }

      // 先获取文件大小，便于失败时一并上报诊断信息
      wx.getFileSystemManager().getFileInfo({
        filePath,
        success: (fileInfo) => this._doUploadLicenseImage(filePath, fileInfo.size, resolve, reject),
        fail: () => this._doUploadLicenseImage(filePath, -1, resolve, reject)
      });
    });
  },

  _doUploadLicenseImage(filePath, fileSize, resolve, reject) {
    const systemInfo = wx.getSystemInfoSync ? wx.getSystemInfoSync() : {};

    wx.uploadFile({
      url: `${app.globalData.baseUrl}/upload/certification`,
      filePath: filePath,
      name: 'certification',
      timeout: 30000, // 显式设置超时，避免默认值在弱网下过短
      header: {
        'Authorization': `Bearer ${app.globalData.token}`
      },
      success: (res) => {
        // 无论状态码是多少，都先尝试解析响应体——
        // 后端 res.error() 在 400/401/403/413 等情况下同样会返回带 message 的 JSON，
        // 之前的写法一看到非 200 就直接吞掉了这些真实原因。
        let parsedData = null;
        try {
          parsedData = JSON.parse(res.data);
        } catch (e) {
          // 非 JSON 响应（比如 Nginx/网关直接返回的错误页），走下面兜底
        }

        if (res.statusCode !== 200) {
          const backendMessage = parsedData && parsedData.message;
          log.error('cert_upload_http_error', {
            statusCode: res.statusCode,
            backendMessage,
            fileSize,
            platform: systemInfo.platform,
            SDKVersion: systemInfo.SDKVersion,
            rawData: parsedData ? undefined : (res.data || '').toString().slice(0, 200)
          });
          reject(new Error(backendMessage || `营业执照上传失败(HTTP ${res.statusCode})`));
          return;
        }

        try {
          const data = parsedData || JSON.parse(res.data);
          if (data.code === 200 && data.data && data.data.url) {
            let url = data.data.url;
            let relativePath;

            if (url.startsWith('http://') || url.startsWith('https://')) {
              const match = url.match(/\/uploads\/.+$/);
              if (match) {
                relativePath = match[0];
              } else {
                const urlParts = url.split('/');
                const uploadsIndex = urlParts.indexOf('uploads');
                if (uploadsIndex > 0) {
                  relativePath = '/' + urlParts.slice(uploadsIndex).join('/');
                } else {
                  relativePath = url;
                }
              }
            } else if (url.startsWith('/')) {
              relativePath = url;
            } else {
              relativePath = '/' + url;
            }

            resolve(relativePath);
          } else {
            log.error('cert_upload_biz_error', {
              code: data.code,
              message: data.message,
              fileSize
            });
            reject(new Error(data.message || '营业执照上传失败'));
          }
        } catch (e) {
          log.error('cert_upload_parse_error', {
            fileSize,
            rawData: (res.data || '').toString().slice(0, 200)
          });
          reject(new Error('解析响应失败'));
        }
      },
      fail: (err) => {
        log.error('cert_upload_fail', {
          errMsg: err.errMsg,
          fileSize,
          networkType: this._networkType,
          platform: systemInfo.platform,
          SDKVersion: systemInfo.SDKVersion
        });
        reject(new Error(err.errMsg || '网络错误'));
      }
    });
  },

  // 提交认证申请
  async submitCertification() {
    if (this.data.submitDisabled || this.data.submitting) {
      wx.showToast({ title: '请完善信息后再提交', icon: 'none' });
      return;
    }

    // 校验省市区完整性
    const region = this.data.region;
    if (!region[0] || !region[1] || !region[2]) {
      wx.showToast({ title: '请选择完整的省市区', icon: 'none' });
      return;
    }
    if (region[1] === '全部' || region[2] === '全部') {
      wx.showToast({ title: '请选择城市和区县', icon: 'none' });
      return;
    }

    // 校验信用代码长度
    if (this.data.formData.creditCode.trim().length !== 18) {
      wx.showToast({ title: '统一社会信用代码必须为18位', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });
    wx.showLoading({ title: '上传营业执照...', mask: true });

    try {
      // 上传营业执照图片
      let licenseImagePath = this.data.licenseImagePath;
      if (licenseImagePath && typeof licenseImagePath === 'string' && licenseImagePath.trim()) {
        licenseImagePath = await this.uploadLicenseImage(licenseImagePath);
      } else {
        throw new Error('请上传营业执照副本');
      }

      wx.showLoading({ title: '提交认证...', mask: true });

      const requestData = {
        companyName: this.data.formData.companyName.trim(),
        creditCode: this.data.formData.creditCode.trim(),
        province: this.data.region[0],
        city: this.data.region[1],
        district: this.data.region[2],
        address: this.data.formData.addressDetail.trim(),
        contactName: this.data.formData.contactName.trim(),
        licenseImage: licenseImagePath
      };

      await new Promise((resolve, reject) => {
        wx.request({
          url: `${app.globalData.baseUrl}/miniprogram/enterprise/certification`,
          method: 'POST',
          header: {
            'Authorization': `Bearer ${app.globalData.token}`,
            'Content-Type': 'application/json'
          },
          data: requestData,
          success: (res) => {
            const ok = res?.data?.success === true || res?.data?.code === 0 || res?.data?.code === 200;
            if (ok) {
              resolve(res.data);
            } else {
              log.error('cert_submit_biz_error', {
                code: res?.data?.code,
                message: res?.data?.message
              });
              reject(new Error(res.data.message || '提交失败'));
            }
          },
          fail: (err) => {
            // 修复：err 是 {errMsg} 对象而非 Error，需转换后才有 .message
            log.error('cert_submit_fail', { errMsg: err.errMsg });
            reject(new Error(err.errMsg || '网络请求失败'));
          }
        });
      });

      wx.hideLoading();
      wx.showToast({ title: '提交成功', icon: 'success' });

      // 切换到查看模式
      this.setData({
        mode: 'view',
        certStatus: 'pending',
        licenseImagePath: licenseImagePath
      });

      // 跳转到「我的」页面
      setTimeout(() => {
        wx.switchTab({
          url: '/pages/profile/profile/profile'
        });
      }, 1500);

    } catch (error) {
      log.error('cert_submit_catch', { message: error.message });
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
      this.setData({ submitting: false });
    }
  }
});
