const express = require('express');
const {
  createTicket,
  getTickets,
  getTicket,
  claimTicket,
  assignTicket,
  updateTicketPriority,
  updateTicketStatus,
  reopenTicket,
  unlockTicket,
  closeTicket,
} = require('../controllers/tickets.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { authorizeRoles } = require('../middleware/role.middleware');
const {
  getMessages,
  postMessage,
  getUnreadSummary,
} = require('../controllers/messages.controller');



const router = express.Router();


// Message routes - MUST be before / and /:id routes
router.get('/unread-summary', authenticate, authorizeRoles('super', 'admin', 'team', 'staff'), getUnreadSummary);


router.get('/:id/messages', authenticate, authorizeRoles('super', 'admin', 'team', 'staff'), getMessages);
router.post('/:id/messages', authenticate, authorizeRoles('super', 'admin', 'team', 'staff'), postMessage);

router.post(
  '/',
  authenticate,
  authorizeRoles('super', 'admin', 'team', 'staff'),
  createTicket
);

router.get('/', authenticate, getTickets);

router.get('/:id', authenticate, getTicket);

router.patch(
  '/:id/claim',
  authenticate,
  authorizeRoles('admin', 'team'),
  claimTicket
);

router.patch(
  '/:id/assign',
  authenticate,
  authorizeRoles('super', 'admin'),
  assignTicket
);

router.patch(
  '/:id/priority',
  authenticate,
  authorizeRoles('super', 'admin', 'team'),
  updateTicketPriority
);

router.patch(
  '/:id/status',
  authenticate,
  authorizeRoles('super', 'admin', 'team'),
  updateTicketStatus
);

router.patch(
  '/:id/reopen',
  authenticate,
  authorizeRoles('super', 'admin', 'team', 'staff'),
  reopenTicket
);

router.patch(
  '/:id/unlock',
  authenticate,
  authorizeRoles('super'),
  unlockTicket
);

router.post(
  '/:id/close',
  authenticate,
  authorizeRoles('super', 'staff'),
  closeTicket
);

module.exports = router;