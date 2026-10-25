const resolveConfig = require('./resolve');
// 新克隆首次编译前：node scripts/configure-runtime.js --production 或 --init。
const local = require('./runtime.generated.js');
module.exports = resolveConfig(wx, local);
