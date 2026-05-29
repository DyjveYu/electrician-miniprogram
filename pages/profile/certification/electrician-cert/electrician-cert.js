// pages/profile/certification/electrician-cert/electrician-cert.js
const app = getApp();

Page({
    data: {
        certificatePath: '',      // 存储的图片路径（相对路径或本地路径）
        displayPath: '',          // 用于显示的完整URL
        canSubmit: false,
        mode: 'apply',
        initializedFromParent: false
    },

    onLoad(options) {
        console.log('🔥 子页面 onLoad, options:', options);
        
        if (options.mode) {
            this.setData({ mode: options.mode });
        }

        this.setupEventChannel();
    },

    // 🔥 工具函数：将相对路径转换为完整URL用于显示
    getFullImageUrl(path) {
     
        // 如果已经是完整URL，直接返回
        if (path.startsWith('http://') || path.startsWith('https://')) {
            return path;
        }
        
        // 如果是本地临时文件，直接返回
        if (path.includes('wxfile://') || path.includes('tmp_')) {
            return path;
        }
        
        // 如果是相对路径，拼接域名
        const imageBaseUrl = app.globalData.imageBaseUrl; // 从全局配置获取图片基础URL
        const normalizedPath = path.startsWith('/') ? path : '/' + path; // 确保路径以/开头
        const fullUrl = imageBaseUrl + normalizedPath;// 拼接完整URL
        console.log('🔥 拼接完整URL:', path, '→', fullUrl);
        return fullUrl;
    },

    setupEventChannel() {
        const eventChannel = this.getOpenerEventChannel();
        console.log('🔥 setupEventChannel, eventChannel存在:', !!eventChannel);
        
        if (eventChannel && eventChannel.on) {
            eventChannel.on('acceptDataFromOpenerPage', (data) => {
                console.log('🔥 收到父页面数据:', data);
                
                if (data.certificatePath) {
                    const originalPath = data.certificatePath;
                    const displayPath = this.getFullImageUrl(originalPath);
                    
                    console.log('🔥 原始路径:', originalPath);
                    console.log('🔥 显示路径:', displayPath);
                    
                    this.setData({
                        certificatePath: originalPath,     // 保存原始路径
                        displayPath: displayPath,          // 保存显示路径
                        initializedFromParent: true,
                        canSubmit: true
                    });
                }
            });
            
            console.log('🔥 eventChannel 监听已注册');
        }
    },

    onReady() {
        console.log('🔥 onReady 触发');
        if (!this.data.initializedFromParent) {
            setTimeout(() => {
                this.loadFromServerIfNeeded();
            }, 100);
        }
    },

    onShow() {
        console.log('🔥 onShow, certificatePath:', this.data.certificatePath);
        console.log('🔥 onShow, displayPath:', this.data.displayPath);
    },

    // 从服务器加载已认证的证书（仅用于查看已通过的认证）
    loadFromServerIfNeeded() {
        if (this.data.initializedFromParent || this.data.certificatePath) {
            console.log('🔥 已有数据，跳过服务器加载');
            return;
        }

        console.log('🔥 开始从服务器加载已认证的证书');

        wx.request({
            url: `${app.globalData.baseUrl}/electricians/certification/status`,
            method: 'GET',
            header: {
                'Authorization': `Bearer ${app.globalData.token}`
            },
            success: (res) => {
                console.log('🔥 服务器响应:', res.data);
                const ok = res?.data?.success === true || res?.data?.code === 0 || res?.data?.code === 200;
                if (!ok) return;

                const data = res?.data?.data || {};
                const cert = data.certification || (data.user_id || data.status ? data : null);
                
                if (!cert) return;

                const certificatePath = cert.certificate_img || '';
                
                if (!certificatePath) return;

                const displayPath = this.getFullImageUrl(certificatePath);
                
                console.log('🔥 从服务器加载的路径:', certificatePath);
                console.log('🔥 转换后的显示路径:', displayPath);

                this.setData({
                    certificatePath: certificatePath,   // 相对路径
                    displayPath: displayPath,           // 完整URL
                    canSubmit: true
                });
            },
            fail: (err) => {
                console.error('🔥 服务器请求失败:', err);
            }
        });
    },

    // 🔥 选择图片 - 只保存本地临时路径
    chooseImage() {
        console.log('🔥 chooseImage, mode:', this.data.mode);
        
        // 查看模式：预览图片
        if (this.data.mode === 'view') {
            if (this.data.displayPath) {
                wx.previewImage({
                    urls: [this.data.displayPath],
                    current: this.data.displayPath
                });
            }
            return;
        }

        // 🔥 [2026-05-06] 修改：改用 wx.chooseImage，支持官方自动压缩
        wx.chooseImage({
            count: 1,
            sizeType: ['compressed'],  // ✅ 官方自动压缩
            sourceType: ['album', 'camera'],
            success: (res) => {
                const tempFilePath = res.tempFilePaths[0];
                console.log('🔥 选择图片成功，本地临时路径:', tempFilePath);
                console.log('🔥 图片大小已由微信官方自动压缩');

                // 🔥 只设置本地路径，不上传到服务器
                this.setData({
                    certificatePath: tempFilePath,   // 本地路径
                    displayPath: tempFilePath,       // 显示也用本地路径
                    canSubmit: true
                }, () => {
                    console.log('🔥 本地图片已设置，等待用户点击确认');
                });
            },
            fail: (err) => {
                console.error('🔥 选择图片失败:', err);
                wx.showToast({ title: '选择图片失败', icon: 'none' });
            }
        });
    },

    // 🔥 点击"确认" - 返回父页面，传递原始路径（本地临时路径或相对路径）
    submit() {
        if (!this.data.canSubmit) {
            console.log('🔥 不满足提交条件');
            return;
        }

        console.log('🔥 返回父页面，传递原始路径:', this.data.certificatePath);
        
        const eventChannel = this.getOpenerEventChannel();
        if (eventChannel && eventChannel.emit) {
            // 🔥 传递原始路径给父页面（可能是本地路径或相对路径）
            eventChannel.emit('acceptDataFromCertPage', {
                certificatePath: this.data.certificatePath
            });
        }

        wx.navigateBack();
    },

    imageError(e) {
        console.error('🔥 图片加载失败:', e.detail);
        console.log('🔍 图片src值:', this.data.imageUrl) // 换成你实际的字段名
        console.error('🔥 当前显示路径:', this.data.displayPath);
        console.error('🔥 原始存储路径:', this.data.certificatePath);
        
        wx.showToast({ 
            title: '图片加载失败', 
            icon: 'none' 
        });
    },

    imageLoad(e) {
        console.log('🔥 图片加载成功');
        console.log('🔥 显示路径:', this.data.displayPath);
    }
});