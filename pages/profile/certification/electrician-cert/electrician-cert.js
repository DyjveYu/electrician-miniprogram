// pages/profile/certification/electrician-cert/electrician-cert.js
const app = getApp();

Page({
    data: {
        certificatePath: '',
        canSubmit: true,
        mode: 'apply'
    },

    onLoad(options) {
        if (options.mode) {
            this.setData({ mode: options.mode });
        }

        const eventChannel = this.getOpenerEventChannel();
        if (eventChannel && eventChannel.on) {
            eventChannel.on('acceptDataFromOpenerPage', (data) => {
                this.setData({
                    certificatePath: data.certificatePath || ''
                });
                this.checkStatus();
            });
        }
    },

    chooseImage() {
        if (this.data.mode === 'view') {
            // View mode: preview
            if (this.data.certificatePath) {
                wx.previewImage({
                    urls: [this.data.certificatePath],
                    current: this.data.certificatePath
                });
            }
            return;
        }

        wx.chooseMedia({
            count: 1,
            mediaType: ['image'],
            sourceType: ['album', 'camera'],
            success: (res) => {
                const tempFilePath = res.tempFiles[0].tempFilePath;
                this.uploadFile(tempFilePath);
            }
        });
    },

    uploadFile(filePath) {
        wx.showLoading({ title: '上传中...' });

        wx.uploadFile({
            url: `${app.globalData.baseUrl}/upload/certification`,
            filePath: filePath,
            name: 'certification',
            header: {
                'Authorization': `Bearer ${app.globalData.token}`
            },
            success: (res) => {
                console.log('电工证上传响应:', res);
                if (res.statusCode !== 200) {
                    console.error('上传失败，状态码:', res.statusCode);
                    wx.showToast({ title: '服务器异常 ' + res.statusCode, icon: 'none' });
                    return;
                }

                try {
                    const data = JSON.parse(res.data);
                    console.log('电工证上传解析数据:', data);

                    if (data.code === 200 && data.data) {
                        const url = app.globalData.baseUrl.replace('/api', '') + data.data.url;
                        console.log('电工证上传成功，URL:', url);
                        this.setData({ certificatePath: url });
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
                console.error('电工证上传网络请求失败:', err);
                wx.showToast({ title: '网络请求失败', icon: 'none' });
            },
            complete: () => {
                wx.hideLoading();
            }
        });
    },

    checkStatus() {
        this.setData({
            canSubmit: true
        });
    },

    submit() {
        if (!this.data.canSubmit) return;

        const eventChannel = this.getOpenerEventChannel();
        eventChannel.emit('acceptDataFromCertPage', {
            certificatePath: this.data.certificatePath
        });

        wx.navigateBack();
    }
});
