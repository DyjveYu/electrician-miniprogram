const { ElectricianHomeAPI } = require('../../../utils/api');
const access = require('../../../utils/contentAccess');
const { listPage } = require('../../../utils/articlePages');
Page(listPage({ api: ElectricianHomeAPI, access, detailPath: '/pages/content/article-detail/index' }));
