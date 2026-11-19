const { SafetyKnowledgeAPI } = require('../../../utils/api');
const { detailPage } = require('../../../utils/articlePages');
require('../../../utils/visitCapture').register(Page, detailPage({ api: SafetyKnowledgeAPI, listPath: '/pages/content/safety-knowledge/index', isPublic: true }));
