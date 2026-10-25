const { SafetyKnowledgeAPI } = require('../../../utils/api');
const { detailPage } = require('../../../utils/articlePages');
Page(detailPage({ api: SafetyKnowledgeAPI, listPath: '/pages/content/safety-knowledge/index', isPublic: true }));
