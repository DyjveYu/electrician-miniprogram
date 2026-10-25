const { ElectricianHomeAPI } = require('../../../utils/api');
const access = require('../../../utils/contentAccess');
const { detailPage } = require('../../../utils/articlePages');
Page(detailPage({ api: ElectricianHomeAPI, access, listPath: '/pages/content/electrician-home/index' }));
