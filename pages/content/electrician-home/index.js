const { ElectricianHomeAPI } = require('../../../utils/api');
const access = require('../../../utils/contentAccess');
const { listPage } = require('../../../utils/articlePages');
require('../../../utils/visitCapture').register(Page, listPage({ api: ElectricianHomeAPI, access, detailPath: '/pages/content/article-detail/index' }));
