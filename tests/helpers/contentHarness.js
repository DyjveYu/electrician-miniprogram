const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');

function harness() {
  const calls = { navigate: [], redirect: [], switchTab: [], relaunch: [], toast: [], request: [], modal: [], scroll: [], removed: [] };
  const pages = [];
  const timers = [];
  let pageDefinition;
  let componentDefinition;
  let app;
  const wx = {
    request: options => calls.request.push(options),
    navigateTo: options => { calls.navigate.push(options); options.complete?.(); },
    reLaunch: options => { calls.relaunch.push(options); options.complete?.(); },
    redirectTo: options => calls.redirect.push(options),
    navigateBack: () => {},
    switchTab: options => calls.switchTab.push(options),
    showLoading() {}, hideLoading() {},
    getNetworkType: options => options.success?.({ networkType: 'wifi' }),
    getSetting: options => options.success?.({ authSetting: { 'scope.userLocation': true } }),
    authorize: options => options.success?.(),
    showToast: options => calls.toast.push(options),
    showModal: options => calls.modal.push(options),
    pageScrollTo: options => calls.scroll.push(options),
    removeStorageSync: key => calls.removed.push(key), setStorageSync: () => {},
    getStorageSync: () => null
  };
  const cache = new Map();
  function load(relative) {
    const file = path.resolve(root, relative);
    if (cache.has(file)) return cache.get(file);
    const module = { exports: {} };
    cache.set(file, module.exports);
    vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
      module, exports: module.exports, wx,
      console: { log() {}, warn() {}, error() {} },
      getApp: () => app, getCurrentPages: () => pages,
      requirePlugin: () => ({ getRecordRecognitionManager: () => ({ start() {}, stop() {} }) }),
      App: definition => { app = definition; },
      Page: definition => { pageDefinition = definition; },
      Component: definition => { componentDefinition = definition; },
      setTimeout: callback => { timers.push(callback); return timers.length; }, clearTimeout() {},
      setInterval() {}, clearInterval() {},
      require: specifier => {
        if (specifier.includes('log.js')) return { error() {} };
        if (specifier.includes('utils/util')) return { validatePhone: () => true };
        const target = path.resolve(path.dirname(file), specifier);
        return load(path.relative(root, fs.existsSync(target) ? target : target + '.js'));
      }
    }, { filename: file });
    cache.set(file, module.exports);
    return module.exports;
  }
  load('app.js');
  function page(relative) {
    load(relative);
    const instance = { ...pageDefinition, data: JSON.parse(JSON.stringify(pageDefinition.data)), route: relative.replace(/\.js$/, ''), setData(value, callback) { for (const [key, item] of Object.entries(value)) { const parts = key.split('.'); let target = this.data; for (const part of parts.slice(0, -1)) target = target[part] ||= {}; target[parts[parts.length - 1]] = item; } callback?.(); } };
    pages.push(instance);
    return instance;
  }
  function login(role = 'electrician', phone = 'registered-test') {
    app.globalData.userInfo = { id: 1, phone, current_role: role, status: 'active' };
    app.globalData.isLogin = true;
    app.globalData.token = 'isolated-token';
  }
  function respond(index, data, statusCode = 200) { calls.request[index].success({ statusCode, data: { code: statusCode, data, message: statusCode === 404 ? '内容不可用' : 'test' } }); calls.request[index].complete?.(); }
  function component(relative) { load(relative); return { ...componentDefinition.methods, pageLifetimes: componentDefinition.pageLifetimes }; }
  return { app, wx, calls, pages, timers, page, login, load, respond, component };
}

module.exports = { harness };
