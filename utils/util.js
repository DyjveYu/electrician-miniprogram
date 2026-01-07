// utils/util.js
// 工具函数

/**
 * 格式化时间
 */
const formatTime = (date, format = 'YYYY-MM-DD HH:mm:ss') => {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hour = String(d.getHours()).padStart(2, '0');
  const minute = String(d.getMinutes()).padStart(2, '0');
  const second = String(d.getSeconds()).padStart(2, '0');
  
  return format
    .replace('YYYY', year)
    .replace('MM', month)
    .replace('DD', day)
    .replace('HH', hour)
    .replace('mm', minute)
    .replace('ss', second);
};

/**
 * 格式化相对时间
 */
const formatRelativeTime = (date) => {
  const now = new Date();
  const target = new Date(date);
  const diff = now.getTime() - target.getTime();
  
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;
  const month = 30 * day;
  const year = 365 * day;
  
  if (diff < minute) {
    return '刚刚';
  } else if (diff < hour) {
    return `${Math.floor(diff / minute)}分钟前`;
  } else if (diff < day) {
    return `${Math.floor(diff / hour)}小时前`;
  } else if (diff < week) {
    return `${Math.floor(diff / day)}天前`;
  } else if (diff < month) {
    return `${Math.floor(diff / week)}周前`;
  } else if (diff < year) {
    return `${Math.floor(diff / month)}个月前`;
  } else {
    return `${Math.floor(diff / year)}年前`;
  }
};

/**
 * 验证手机号
 */
const validatePhone = (phone) => {
  const phoneRegex = /^1[3-9]\d{9}$/;
  return phoneRegex.test(phone);
};

/**
 * 验证邮箱
 */
const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * 格式化金额
 */
const formatMoney = (amount, decimals = 2) => {
  if (isNaN(amount)) return '0.00';
  return Number(amount).toFixed(decimals);
};

/**
 * 格式化距离
 */
const formatDistance = (distance) => {
  if (distance < 1000) {
    return `${Math.round(distance)}m`;
  } else {
    return `${(distance / 1000).toFixed(1)}km`;
  }
};

/**
 * 计算两点间距离（米）
 */
const calculateDistance = (lat1, lng1, lat2, lng2) => {
  const radLat1 = lat1 * Math.PI / 180.0;
  const radLat2 = lat2 * Math.PI / 180.0;
  const a = radLat1 - radLat2;
  const b = lng1 * Math.PI / 180.0 - lng2 * Math.PI / 180.0;
  let s = 2 * Math.asin(Math.sqrt(Math.pow(Math.sin(a / 2), 2) +
    Math.cos(radLat1) * Math.cos(radLat2) * Math.pow(Math.sin(b / 2), 2)));
  s = s * 6378.137;
  s = Math.round(s * 10000) / 10000;
  return s * 1000; // 返回米
};

/**
 * 防抖函数
 */
const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

/**
 * 节流函数
 */
const throttle = (func, limit) => {
  let inThrottle;
  return function() {
    const args = arguments;
    const context = this;
    if (!inThrottle) {
      func.apply(context, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
};

/**
 * 深拷贝
 */
const deepClone = (obj) => {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  
  if (obj instanceof Date) {
    return new Date(obj.getTime());
  }
  
  if (obj instanceof Array) {
    return obj.map(item => deepClone(item));
  }
  
  if (typeof obj === 'object') {
    const clonedObj = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        clonedObj[key] = deepClone(obj[key]);
      }
    }
    return clonedObj;
  }
};

/**
 * 获取文件扩展名
 */
const getFileExtension = (filename) => {
  return filename.slice((filename.lastIndexOf('.') - 1 >>> 0) + 2);
};

/**
 * 格式化文件大小
 */
const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

/**
 * 生成随机字符串
 */
const generateRandomString = (length = 8) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

/**
 * 获取订单状态文本
 */
const getOrderStatusText = (status) => {
  const statusMap = {
    'pending': '待接单',
    'accepted': '已接单',
    'in_progress': '维修中',
    'completed': '已完成',
    'paid': '已支付',
    'cancelled': '已取消',
    'cancel_pending': '取消处理中',
    'pending_payment': '待支付预付款',
    'pending_repair_payment': '待支付维修费',
    'pending_review': '待评价',
    'closed': '交易关闭',
    'settled': '已结算'
  };
  return statusMap[status] || '未知状态';
};

/**
 * 展示层状态映射（基于订单对象综合判断）
 * 不改变数据库枚举，只返回展示用文案与代码
 */
const mapOrderToDisplayStatus = (order) => {
  if (!order || typeof order !== 'object') {
    return { code: 'unknown', text: '未知状态' };
  }
  const st = order.status;
  const hasPaidPrepay = !!order.prepaid_at || !!order.has_paid_prepay;
  const hasPaidRepair = !!order.has_paid_repair;
  const hasReview = !!order.has_review;
  const electricianId = order.electrician_id || order.electricianId || null;
  const finalAmount = order.final_amount ?? order.amount ?? null;
  const repairContent = order.repair_content ?? order.completion_note ?? null;

  // 交易关闭类
  if (st === 'cancelled' || st === 'closed') {
    return { code: 'closed', text: '交易关闭' };
  }
  if (st === 'cancel_pending') {
    return { code: 'cancel_pending', text: '交易关闭（取消处理中）' };
  }
  
  // 已结算
  if (st === 'settled') {
    return { code: 'settled', text: '已结算' };
  }

  // 待支付预付款
  if (st === 'pending_payment' || (st === 'pending' && !hasPaidPrepay)) {
    return { code: 'prepay_pending', text: '待支付预付款' };
  }

  // 待接单（已支付预付款，且未分配电工）
  if (st === 'pending' && hasPaidPrepay && !electricianId) {
    return { code: 'waiting_accept', text: '待接单' };
  }

  // 已接单（如电工已提交金额/维修内容但未支付维修费，则显示“待支付维修费”）
  if (st === 'accepted') {
    const needRepairPay = ((finalAmount && Number(finalAmount) > 0) || !!repairContent) && !hasPaidRepair;
    if (needRepairPay) {
      return { code: 'repair_pay_pending', text: '待支付维修费' };
    }
    return { code: 'accepted', text: '已接单' };
  }

  // 待支付维修费阶段
  if (st === 'pending_repair_payment') {
    if (!hasPaidRepair) {
      return { code: 'repair_pay_pending', text: '待支付维修费' };
    }
    // 用户已支付维修费，但状态尚未切到 in_progress，由电工通过“开始维修”接口进行转换
    return { code: 'in_progress', text: '维修中' };
  }

  // 维修中
  if (st === 'in_progress') {
    return { code: 'in_progress', text: '维修中' };
  }

  // 已完成/待评价
  if (st === 'completed') {
    if (hasReview) {
      return { code: 'completed', text: '已完成' };
    }
    return { code: 'pending_review', text: '待评价' };
  }

  return { code: 'unknown', text: getOrderStatusText(st) };
};

/**
 * 仅返回展示层状态文案
 */
const getDisplayStatusText = (order) => mapOrderToDisplayStatus(order).text;

/**
 * 获取支付状态文本
 */
const getPaymentStatusText = (status) => {
  const statusMap = {
    'pending': '待支付',
    'paid': '已支付',
    'failed': '支付失败',
    'timeout': '支付超时'
  };
  return statusMap[status] || '未知状态';
};

/**
 * 获取用户角色文本
 */
const getUserRoleText = (role) => {
  const roleMap = {
    'user': '用户',
    'electrician': '电工'
  };
  return roleMap[role] || '未知角色';
};

/**
 * 选择图片
 */
const chooseImage = (options = {}) => {
  return new Promise((resolve, reject) => {
    const {
      count = 1,
      sizeType = ['original', 'compressed'],
      sourceType = ['album', 'camera']
    } = options;
    
    wx.chooseImage({
      count,
      sizeType,
      sourceType,
      success: resolve,
      fail: reject
    });
  });
};

/**
 * 预览图片
 */
const previewImage = (current, urls = []) => {
  wx.previewImage({
    current,
    urls: Array.isArray(urls) ? urls : [current]
  });
};

/**
 * 获取位置
 */
const getLocation = (type = 'gcj02') => {
  return new Promise((resolve, reject) => {
    wx.getLocation({
      type,
      success: resolve,
      fail: reject
    });
  });
};

/**
 * 选择位置
 */
const chooseLocation = () => {
  return new Promise((resolve, reject) => {
    wx.chooseLocation({
      success: resolve,
      fail: reject
    });
  });
};

/**
 * 打开地图
 */
const openLocation = (latitude, longitude, name = '', address = '') => {
  wx.openLocation({
    latitude: parseFloat(latitude),
    longitude: parseFloat(longitude),
    name,
    address
  });
};

/**
 * 拨打电话
 */
const makePhoneCall = (phoneNumber) => {
  wx.makePhoneCall({
    phoneNumber
  });
};

/**
 * 复制到剪贴板
 */
const setClipboardData = (data) => {
  return new Promise((resolve, reject) => {
    wx.setClipboardData({
      data,
      success: resolve,
      fail: reject
    });
  });
};

/**
 * 扫码
 */
const scanCode = (options = {}) => {
  return new Promise((resolve, reject) => {
    const {
      onlyFromCamera = false,
      scanType = ['barCode', 'qrCode']
    } = options;
    
    wx.scanCode({
      onlyFromCamera,
      scanType,
      success: resolve,
      fail: reject
    });
  });
};

/**
 * 震动
 */
const vibrateShort = () => {
  wx.vibrateShort();
};

const vibrateLong = () => {
  wx.vibrateLong();
};

/**
 * 存储数据
 */
const setStorage = (key, data) => {
  return new Promise((resolve, reject) => {
    wx.setStorage({
      key,
      data,
      success: resolve,
      fail: reject
    });
  });
};

/**
 * 获取存储数据
 */
const getStorage = (key) => {
  return new Promise((resolve, reject) => {
    wx.getStorage({
      key,
      success: (res) => resolve(res.data),
      fail: reject
    });
  });
};

/**
 * 删除存储数据
 */
const removeStorage = (key) => {
  return new Promise((resolve, reject) => {
    wx.removeStorage({
      key,
      success: resolve,
      fail: reject
    });
  });
};

module.exports = {
  formatTime,
  formatRelativeTime,
  validatePhone,
  validateEmail,
  formatMoney,
  formatDistance,
  calculateDistance,
  debounce,
  throttle,
  deepClone,
  getFileExtension,
  formatFileSize,
  generateRandomString,
  getOrderStatusText,
  mapOrderToDisplayStatus,
  getDisplayStatusText,
  getPaymentStatusText,
  getUserRoleText,
  chooseImage,
  previewImage,
  getLocation,
  chooseLocation,
  openLocation,
  makePhoneCall,
  setClipboardData,
  scanCode,
  vibrateShort,
  vibrateLong,
  setStorage, 
  getStorage,
  removeStorage
};