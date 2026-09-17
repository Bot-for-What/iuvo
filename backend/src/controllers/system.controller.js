const {
  autoCloseResolvedTickets
} = require('../services/auto-close.service');

function requireInternalCronKey(req, res, next) {
  const configuredKey = process.env.INTERNAL_CRON_KEY;
  const receivedKey = req.get('x-internal-cron-key');

  if (!configuredKey) {
    return res.status(500).json({
      message: 'INTERNAL_CRON_KEY is not configured.'
    });
  }

  if (!receivedKey || receivedKey !== configuredKey) {
    return res.status(401).json({
      message: 'Unauthorized internal cron request.'
    });
  }

  return next();
}

async function runAutoClose(req, res, next) {
  try {
    const result = await autoCloseResolvedTickets();

    return res.status(200).json({
      message: 'Auto-close completed.',
      closedCount: result.closedCount
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  requireInternalCronKey,
  runAutoClose
};
