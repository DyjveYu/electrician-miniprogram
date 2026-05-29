// pages/profile/certification/identity/identity.js
const app = getApp();

Page({
    data: {
        idCardFront: '',          // 存储的图片路径（相对路径或本地路径）
        idCardBack: '',           // 存储的图片路径（相对路径或本地路径）
        displayFront: '',         // 用于显示的完整URL
        displayBack: '',          // 用于显示的完整URL
        canSubmit: false,
        mode: 'apply',
        initializedFromParent: false
    },

    onLoad(options) {
        if (options.mode) {
            this.setData({ mode: options.mode });
        }

        console.log('🔥 身份证上传页 onLoad, mode:', this.data.mode);

        const eventChannel = this.getOpenerEventChannel();
        if (eventChannel && eventChannel.on) {
            eventChannel.on('acceptDataFromOpenerPage', (data) => {
                console.log('🔥 身份证页面收到上级传入数据:', data);
                
                const frontPath = data.idCardFront || '';
                const backPath = data.idCardBack || '';
                
                this.setData({
                    idCardFront: frontPath,
                    idCardBack: backPath,
                    displayFront: this.getFullImageUrl(frontPath),
                    displayBack: this.getFullImageUrl(backPath),
                    initializedFromParent: !!(frontPath || backPath)
                });
                this.checkStatus();
            });
        }

        this.loadFromServerIfNeeded();
    },

    // 🔥 新增：将相对路径转换为完整URL用于显示
    getFullImageUrl(path) {
        if (!path) return '';
        
        // 如果已经是完整URL，直接返回
        if (path.startsWith('http://') || path.startsWith('https://')) {
            return path;
        }
        
        // 如果是本地临时文件，直接返回
        if (path.includes('wxfile://') || path.includes('tmp_')) {
            return path;
        }
        
        // 如果是相对路径，拼接域名
        const app = getApp();
        const imageBaseUrl = app.globalData.imageBaseUrl; // 从全局配置获取图片基础URL
        const normalizedPath = path.startsWith('/') ? path : '/' + path; // 确保路径以/开头
        const fullUrl = imageBaseUrl + normalizedPath;// 拼接完整URL
        console.log('🔥 拼接完整URL:', path, '→', fullUrl);
        return fullUrl;
    },

    loadFromServerIfNeeded() {
        if (this.data.initializedFromParent || (this.data.idCardFront && this.data.idCardBack)) {
            console.log('🔥 已有数据，跳过服务器加载');
            return;
        }

        console.log('🔥 开始从服务器加载已认证的身份证');
        const app = getApp();

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

                if (this.data.initializedFromParent) return;

                const idCardFront = cert.id_card_front || '';
                const idCardBack = cert.id_card_back || '';

                if (!idCardFront && !idCardBack) return;

                console.log('🔥 从服务器加载的路径:');
                console.log('   - 正面:', idCardFront);
                console.log('   - 背面:', idCardBack);

                this.setData({
                    idCardFront: idCardFront,
                    idCardBack: idCardBack,
                    displayFront: this.getFullImageUrl(idCardFront),
                    displayBack: this.getFullImageUrl(idCardBack)
                });
                this.checkStatus();
            }
        });
    },

    // 🔥 修改：选择图片 - 只保存本地路径
    chooseImage(e) {
        console.log('🔥 chooseImage, mode:', this.data.mode);
        
        const type = e.currentTarget.dataset.type;

        // 查看模式：预览图片
        if (this.data.mode === 'view') {
            const url = type === 'front' ? this.data.displayFront : this.data.displayBack;
            if (url) {
                wx.previewImage({
                    urls: [url],
                    current: url
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
                console.log(`🔥 选择图片成功（${type === 'front' ? '正面' : '背面'}）:`, tempFilePath);
                console.log(`🔥 图片大小已由微信官方自动压缩`);

                // 🔥 只设置本地路径，不上传到服务器
                if (type === 'front') {
                    this.setData({
                        idCardFront: tempFilePath,
                        displayFront: tempFilePath
                    });
                } else {
                    this.setData({
                        idCardBack: tempFilePath,
                        displayBack: tempFilePath
                    });
                }

                this.checkStatus();
                console.log('🔥 本地图片已设置，等待用户点击确认');
            },
            fail: (err) => {
                console.error('选择图片失败:', err);
                wx.showToast({ title: '选择图片失败', icon: 'none' });
            }
        });
    },

    checkStatus() {
        const { idCardFront, idCardBack } = this.data;
        this.setData({
            canSubmit: !!(idCardFront && idCardBack)
        });
    },

    // 🔥 点击"确认" - 返回父页面，传递原始路径
    submit() {
        if (!this.data.canSubmit) {
            console.log('🔥 不满足提交条件');
            return;
        }

        console.log('🔥 返回父页面，传递路径:');
        console.log('   - 正面:', this.data.idCardFront);
        console.log('   - 背面:', this.data.idCardBack);

        // 🔥 传递原始路径给父页面（可能是本地路径或相对路径）
        const eventChannel = this.getOpenerEventChannel();
        eventChannel.emit('acceptDataFromIdentityPage', {
            idCardFront: this.data.idCardFront,
            idCardBack: this.data.idCardBack
        });

        wx.navigateBack();
    }
});