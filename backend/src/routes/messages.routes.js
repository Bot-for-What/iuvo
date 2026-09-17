const express = require('express');
const {
  getMessages,
  postMessage,
  getUnreadSummary,
} = require('../controllers/messages.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { authorizeRoles } = require('../middleware/role.middleware');

const router = express.Router();

router.use(authenticate);

// GET /api/tickets/unread-summary
router.get('/tickets/unread-summary', authorizeRoles('super', 'admin', 'team', 'staff'), getUnreadSummary);

// GET /api/tickets/:id/messages
router.get('/tickets/:id/messages', authorizeRoles('super', 'admin', 'team', 'staff'), getMessages);

// POST /api/tickets/:id/messages
router.post('/tickets/:id/messages', authorizeRoles('super', 'admin', 'team', 'staff'), postMessage);

module.exports = router;