// pages/profile/edit/edit.js
Page({
  data: {
    userInfo: {
      nickname: '',
      avatar: '',
      phone: ''
    },
    uploading: false,
    saving: false
  },

  onLoad() {
    this.loadUserInfo();
  },

  // 加载用户信息
  loadUserInfo() {
    const app = getApp();
    if (app.globalData.userInfo) {
      this.setData({
        userInfo: {
          nickname: app.globalData.userInfo.nickname || '',
          avatar: app.globalData.userInfo.avatar || '',
          phone: app.globalData.userInfo.phone || ''
        }
      });
    }
  },

  // 输入昵称
  onNicknameInput(e) {
    this.setData({
      'userInfo.nickname': e.detail.value
    });
  },

  // 选择头像
  chooseAvatar() {
    const that = this;
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success(res) {
        const tempFilePath = res.tempFilePaths[0];
        that.uploadAvatar(tempFilePath);
      }
    });
  },

  // 上传头像

  /* 旧代码
  uploadAvatar(filePath) {
    this.setData({ uploading: true });
    
    const app = getApp();
    wx.uploadFile({
      url: `${app.globalData.baseUrl}/upload/avatar`,
      filePath: filePath,
      name: 'avatar',
      header: {
        'Authorization': `Bearer ${app.globalData.token}`
      },
      success: (res) => {
        this.setData({ uploading: false });
        const data = JSON.parse(res.data);
        console.log('头像上传相应：',res.data)
        if (data.code === 0) {
          // 打印上传成功后的响应数据，便于调试
          console.log('头像上传成功1，响应数据:', data.data);
          
          // 保存完整的URL路径（添加域名前缀）
          const baseUrlWithoutApi = app.globalData.baseUrl.replace('/api', '');
          const fullAvatarUrl = data.data.url.startsWith('http') 
            ? data.data.url 
            : `${baseUrlWithoutApi}${data.data.url}`;
          
          console.log('完整头像URL:', fullAvatarUrl);
          
          this.setData({
            'userInfo.avatar': fullAvatarUrl
          });
          wx.showToast({ title: '头像上传成功1', icon: 'success' });
        } else {
          wx.showToast({ title: data.message || '上传失败', icon: 'none' });
        }
      },
      fail: () => {
        this.setData({ uploading: false });
        wx.showToast({ title: '上传失败，请重试', icon: 'none' });
      }
    });
  },
*/
uploadAvatar(filePath) {
  this.setData({ uploading: true });

  const app = getApp();
  wx.uploadFile({
    url: `${app.globalData.cloudUrl}/upload/avatar`,
    filePath,
    name: 'avatar',
    header: {
      'Authorization': `Bearer ${app.globalData.token}`
    },
    success: (res) => {
      this.setData({ uploading: false });

      console.log('原始上传响应:', res.data);

      let data;
      try {
        data = JSON.parse(res.data);
      } catch (err) {
        console.error('解析上传响应失败:', err);
        wx.showToast({ title: '响应解析失败', icon: 'none' });
        return;
      }

      if ((data.code === 0 || data.code === 200) && data.data && data.data.url) {
        const baseUrlWithoutApi = app.globalData.baseUrl.replace('/api', '');
        const fullAvatarUrl = data.data.url.startsWith('http')
          ? data.data.url
          : `${baseUrlWithoutApi}${data.data.url}`;
      
        console.log('完整头像URL:', fullAvatarUrl);
      
        this.setData({
          userInfo: {
            ...this.data.userInfo,
            avatar: fullAvatarUrl
          }
        });

        console.log('更新后的 userInfo:', this.data.userInfo);
        wx.showToast({ title: '头像上传成功', icon: 'success' });
      } else {
        console.warn('上传接口响应异常:', data);
        wx.showToast({ title: data.message || '上传失败', icon: 'none' });
      }
    },
    fail: (err) => {
      this.setData({ uploading: false });
      console.error('头像上传失败:', err);
      wx.showToast({ title: '上传失败，请重试', icon: 'none' });
    }
  });
},

  // 保存用户信息
  saveUserInfo() {
    console.log('>>> saveUserInfo() 函数被触发');
    console.log('保存前的 userInfo:', this.data.userInfo);
    if (!this.validateForm()) return;
    
    if (this.data.saving) return;
    
  
    this.setData({ saving: true });
    
    const app = getApp();
    // 准备请求数据，只包含必要字段
    const requestData = {
      nickname: this.data.userInfo.nickname
    };
    
    // 如果有头像，则添加到请求数据中
    if (this.data.userInfo.avatar) {
      // 确保头像URL是完整的URL，如果是相对路径，则添加baseUrl前缀
      let avatarUrl = this.data.userInfo.avatar;
      if (avatarUrl && !avatarUrl.startsWith('http')) {
        // 移除开头的斜杠，避免重复
        if (avatarUrl.startsWith('/')) {
          avatarUrl = avatarUrl.substring(1);
        }
        // 构建完整URL
        const baseUrlWithoutApi = app.globalData.baseUrl.replace('/api', '');
        avatarUrl = `${baseUrlWithoutApi}/${avatarUrl}`;
      }
      requestData.avatar = avatarUrl;
      console.log('保存头像URL:', avatarUrl);
    }
    
    wx.request({
      url: `${app.globalData.baseUrl}/users/profile`,
      method: 'PUT',
      header: {
        'Authorization': `Bearer ${app.globalData.token}`
      },
      data: requestData,
      success: (res) => {
        this.setData({ saving: false });
        if (res.data.code === 200 ) {
          // 更新全局用户信息
          app.globalData.userInfo = {
            ...app.globalData.userInfo,
            ...this.data.userInfo
          };
          
          // 更新本地存储
          wx.setStorageSync('userInfo', app.globalData.userInfo);
          
          // 触发自定义事件，通知"我的页面"刷新
          const pages = getCurrentPages();
          const prevPage = pages[pages.length - 2]; // 获取上一个页面
          if (prevPage) {
            // 如果是从"我的页面"进入的编辑页面
            prevPage.setData({
              needRefresh: true // 设置一个标记，表示需要刷新
            });
          }
          
          // 显示成功提示并返回
          wx.showToast({ 
            title: '保存成功', 
            icon: 'success',
            mask: true,  // 添加遮罩防止用户多次点击
            duration: 1500
          });
          
          // 确保toast显示后再返回
          setTimeout(() => {
            wx.navigateBack({
              delta: 1
            });
          }, 1500);
        } else {
          wx.showToast({ title: res.data.message || '保存失败', icon: 'none' });
        }
      },
      fail: () => {
        this.setData({ saving: false });
        wx.showToast({ title: '网络错误，请重试', icon: 'none' });
      }
    });
  },

  // 表单验证
  validateForm() {
    if (!this.data.userInfo.nickname.trim()) {
      wx.showToast({ title: '请输入昵称', icon: 'none' });
      return false;
    }
    return true;
  }
});