// 将唯一正文来源打包为小程序可引用的原生文本，保留段落和顺序。
const fs = require('node:fs');
const path = require('node:path');
const source = path.resolve(__dirname, '../../docs/requirements/v1.2.0/协议政策/1.2.1订单预约服务预付款协议(新).md');
const target = path.resolve(__dirname, '../config/prepay-agreement.js');
const paragraphs = fs.readFileSync(source, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
if (!paragraphs.length) throw new Error('预付款协议正文为空');
fs.writeFileSync(target, '// 自动生成，请修改协议 Markdown 后运行 node scripts/build-prepay-agreement.js\nmodule.exports = ' + JSON.stringify(paragraphs, null, 2) + ';\n', 'utf8');
console.log(`已生成预付款协议，共 ${paragraphs.length} 段`);
