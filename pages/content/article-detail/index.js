const { ElectricianHomeAPI } = require('../../../utils/api');
const access = require('../../../utils/contentAccess');
const { detailPage } = require('../../../utils/articlePages');
require('../../../utils/visitCapture').register(Page, detailPage({ api: ElectricianHomeAPI, access, listPath: '/pages/content/electrician-home/index' }));
