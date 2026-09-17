const db = require('../db/connection');
const { writeSecurityAuditEvent } = require('../services/security-audit.service');

async function hasSecurityAdminPermission(userId) {
  const permission = await db('user_permissions')
    .select('id')
    .where({
      user_id: userId,
      permission: 'security_admin'
    })
    .first();

  return Boolean(permission);
}

async function requireSecurityAdminAccess(req, res, next) {
  try {
    if (req.user?.role === 'super') {
      return next();
    }

    const allowed = (
      req.user?.role === 'admin' &&
      await hasSecurityAdminPermission(req.user.sub)
    );

    if (allowed) {
      return next();
    }

    if (req.user?.sub) {
      await writeSecurityAuditEvent({
        actorId: req.user.sub,
        eventType: 'security_access_denied',
        outcome: 'denied'
      });
    }

    return res.status(403).json({
      message: 'You do not have permission to perform this action.'
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  hasSecurityAdminPermission,
  requireSecurityAdminAccess
};
