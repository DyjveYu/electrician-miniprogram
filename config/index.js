const resolveConfig = require('./resolve');
// 修改日期：2026-11-12。local.json 不直接打包；生成器将它写成下面的 JS 模块。
// 首次编译前运行 configure-runtime.js --init；上传前用 --production 关闭个人覆盖。
// --production 不强制连接生产：trial/release 的选择仍由 resolve.js 根据微信环境决定。
const local = require('./runtime.generated.js');
module.exports = resolveConfig(wx, local);
