// pages/profile/certification/identity/identity.js
const app = getApp();

Page({
    data: {
        idCardFront: '',
        idCardBack: '',
        canSubmit: false,
        mode: 'apply'
    },

    onLoad(options) {
        if (options.mode) {
            this.setData({ mode: options.mode });
        }

        // Initialize with passed data if available
        const eventChannel = this.getOpenerEventChannel();
        if (eventChannel && eventChannel.on) {
            eventChannel.on('acceptDataFromOpenerPage', (data) => {
                this.setData({
                    idCardFront: data.idCardFront || '',
                    idCardBack: data.idCardBack || ''
                });
                this.checkStatus();
            });
        }
    },

    chooseImage(e) {
        if (this.data.mode === 'view') {
            // View mode: preview image
            const type = e.currentTarget.dataset.type;
            const url = type === 'front' ? this.data.idCardFront : this.data.idCardBack;
            if (url) {
                wx.previewImage({
                    urls: [url],
                    current: url
                });
            }
            return;
        }

        const type = e.currentTarget.dataset.type;

        wx.chooseMedia({
            count: 1,
            mediaType: ['image'],
            sourceType: ['album', 'camera'],
            success: (res) => {
                const tempFilePath = res.tempFiles[0].tempFilePath;
                this.uploadFile(tempFilePath, type);
            }
        });
    },

    uploadFile(filePath, type) {
        wx.showLoading({ title: '上传中...' });

        wx.uploadFile({
            url: `${app.globalData.baseUrl}/upload/certification`,
            filePath: filePath,
            name: 'certification',
            header: {
                'Authorization': `Bearer ${app.globalData.token}`
            },
            success: (res) => {
                console.log('身份证上传响应:', res);
                if (res.statusCode !== 200) {
                    console.error('上传失败，状态码:', res.statusCode);
                    wx.showToast({ title: '服务器异常 ' + res.statusCode, icon: 'none' });
                    return;
                }

                try {
                    const data = JSON.parse(res.data);
                    console.log('身份证上传解析数据:', data);

                    if (data.code === 200 && data.data) {
                        const url = app.globalData.baseUrl.replace('/api', '') + data.data.url;
                        console.log('图片上传成功，完整URL:', url);
                        if (type === 'front') {
                            this.setData({ idCardFront: url });
                        } else {
                            this.setData({ idCardBack: url });
                        }
                        this.checkStatus();
                    } else {
                        console.error('业务状态码错误:', data);
                        wx.showToast({ title: data.message || '上传失败', icon: 'none' });
                    }
                } catch (e) {
                    console.error('解析响应失败:', e);
                    wx.showToast({ title: '解析响应失败', icon: 'none' });
                }
            },
            fail: (err) => {
                console.error('身份证上传网络请求失败:', err);
                wx.showToast({ title: '网络请求失败', icon: 'none' });
            },
            complete: () => {
                wx.hideLoading();
            }
        });
    },

    checkStatus() {
        const { idCardFront, idCardBack } = this.data;
        this.setData({
            canSubmit: !!(idCardFront && idCardBack)
        });
    },

    submit() {
        if (!this.data.canSubmit) return;

        // Return data to previous page
        const eventChannel = this.getOpenerEventChannel();
        eventChannel.emit('acceptDataFromIdentityPage', {
            idCardFront: this.data.idCardFront,
            idCardBack: this.data.idCardBack
        });

        wx.navigateBack();
    }
});
