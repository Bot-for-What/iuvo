const express = require('express');
const {
  requireInternalCronKey,
  runAutoClose
} = require('../controllers/system.controller');

const router = express.Router();

router.post(
  '/cron/auto-close',
  requireInternalCronKey,
  runAutoClose
);

module.exports = router;
