const { SafetyKnowledgeAPI } = require('../../../utils/api');
const { listPage } = require('../../../utils/articlePages');
Page(listPage({ api: SafetyKnowledgeAPI, detailPath: '/pages/content/safety-knowledge-detail/index', isPublic: true }));
