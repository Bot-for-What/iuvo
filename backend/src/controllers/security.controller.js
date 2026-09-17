const db = require('../db/connection');
const {
  getEffectivePasswordPolicy,
  getGlobalPasswordPolicy,
  normalizePolicy,
  policyToSettings
} = require('../services/password-policy.service');
const { writeSecurityAuditEvent } = require('../services/security-audit.service');

function normalizeReason(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function serializePolicy(policy) {
  return {
    minLength: policy.minLength,
    requireUppercase: policy.requireUppercase,
    requireLowercase: policy.requireLowercase,
    requireNumber: policy.requireNumber,
    requireSpecialCharacter: policy.requireSpecialCharacter
  };
}

function serializeSecurityUser(user, policy) {
  return {
    id: user.id,
    username: user.username,
    fullName: user.full_name,
    role: user.role,
    unitId: user.unit_id,
    unitName: user.unit_name || null,
    departmentId: user.department_id,
    departmentName: user.department_name || null,
    isActive: user.is_active,
    mustChangePassword: Boolean(user.must_change_password),
    policySource: policy.source,
    passwordPolicy: serializePolicy(policy)
  };
}

async function getSecurityTarget(userId) {
  return db('users as u')
    .leftJoin('units as unit', 'u.unit_id', 'unit.id')
    .leftJoin('departments as department', 'u.department_id', 'department.id')
    .select(
      'u.id',
      'u.username',
      'u.full_name',
      'u.role',
      'u.unit_id',
      'u.department_id',
      'u.is_active',
      'u.must_change_password',
      'u.password_policy_override',
      'unit.name as unit_name',
      'department.name as department_name'
    )
    .where('u.id', userId)
    .first();
}

function canManageSecurityTarget(actor, target) {
  if (!target || target.role === 'super') {
    return false;
  }

  if (actor.role === 'super') {
    return true;
  }

  return (
    actor.role === 'admin' &&
    target.unit_id === actor.unitId &&
    (target.role === 'team' || target.role === 'staff')
  );
}

async function requireManagedTarget(req, res, eventType) {
  const target = await getSecurityTarget(req.params.userId);

  if (!target) {
    return {
      response: res.status(404).json({
        message: 'User not found.'
      })
    };
  }

  if (!canManageSecurityTarget(req.user, target)) {
    await writeSecurityAuditEvent({
      actorId: req.user.sub,
      targetUserId: target.id,
      eventType,
      outcome: 'denied'
    });

    return {
      response: res.status(403).json({
        message: 'You do not have permission to perform this action.'
      })
    };
  }

  return { target };
}

async function getPasswordPolicy(req, res, next) {
  try {
    const policy = await getGlobalPasswordPolicy();

    return res.status(200).json({
      passwordPolicy: {
        minLength: policy.minLength,
        requireUppercase: policy.requireUppercase,
        requireLowercase: policy.requireLowercase,
        requireNumber: policy.requireNumber,
        requireSpecialCharacter: policy.requireSpecialCharacter,
        updatedBy: policy.updatedBy,
        updatedAt: policy.updatedAt
      }
    });
  } catch (error) {
    return next(error);
  }
}

async function updatePasswordPolicy(req, res, next) {
  try {
    const reason = normalizeReason((req.body || {}).reason);
    const normalized = normalizePolicy((req.body || {}).passwordPolicy);

    if (!reason) {
      return res.status(400).json({
        message: 'reason is required.'
      });
    }

    if (normalized.error) {
      return res.status(400).json({
        message: normalized.error
      });
    }

    const existingPolicy = await getGlobalPasswordPolicy();
    const beforeValue = serializePolicy(existingPolicy);
    const afterValue = normalized.value;

    await db.transaction(async (transaction) => {
      await transaction('security_settings')
        .where('id', 1)
        .update({
          ...policyToSettings(afterValue),
          updated_by: req.user.sub
        });

      await transaction('users')
        .whereNot('role', 'super')
        .whereNull('password_policy_override')
        .update({
          must_change_password: true
        });

      await writeSecurityAuditEvent({
        actorId: req.user.sub,
        eventType: 'global_policy_updated',
        beforeValue,
        afterValue,
        reason,
        outcome: 'completed'
      }, transaction);
    });

    return res.status(200).json({
      message: 'Global password policy has been updated.',
      passwordPolicy: afterValue
    });
  } catch (error) {
    return next(error);
  }
}

async function getSecurityUsers(req, res, next) {
  try {
    const query = db('users as u')
      .leftJoin('units as unit', 'u.unit_id', 'unit.id')
      .leftJoin('departments as department', 'u.department_id', 'department.id')
      .select(
        'u.id',
        'u.username',
        'u.full_name',
        'u.role',
        'u.unit_id',
        'u.department_id',
        'u.is_active',
        'u.must_change_password',
        'u.password_policy_override',
        'unit.name as unit_name',
        'department.name as department_name'
      )
      .whereNot('u.role', 'super')
      .orderBy('u.full_name', 'asc');

    if (req.user.role === 'admin') {
      query
        .where('u.unit_id', req.user.unitId)
        .whereIn('u.role', ['team', 'staff']);
    }

    const users = await query;
    const serializedUsers = await Promise.all(
      users.map(async (user) => {
        const policy = await getEffectivePasswordPolicy(user);
        return serializeSecurityUser(user, policy);
      })
    );

    return res.status(200).json({
      users: serializedUsers
    });
  } catch (error) {
    return next(error);
  }
}

async function setUserPasswordPolicy(req, res, next) {
  try {
    const result = await requireManagedTarget(req, res, 'user_policy_updated');

    if (result.response) {
      return result.response;
    }

    const reason = normalizeReason((req.body || {}).reason);
    const normalized = normalizePolicy((req.body || {}).passwordPolicy);

    if (!reason) {
      return res.status(400).json({
        message: 'reason is required.'
      });
    }

    if (normalized.error) {
      return res.status(400).json({
        message: normalized.error
      });
    }

    const beforePolicy = await getEffectivePasswordPolicy(result.target);

    await db.transaction(async (transaction) => {
      await transaction('users')
        .where('id', result.target.id)
        .update({
          password_policy_override: normalized.value,
          must_change_password: true
        });

      await writeSecurityAuditEvent({
        actorId: req.user.sub,
        targetUserId: result.target.id,
        eventType: 'user_policy_updated',
        beforeValue: {
          source: beforePolicy.source,
          passwordPolicy: serializePolicy(beforePolicy)
        },
        afterValue: {
          source: 'custom',
          passwordPolicy: normalized.value
        },
        reason,
        outcome: 'completed'
      }, transaction);
    });

    return res.status(200).json({
      message: 'User password policy has been updated.',
      passwordPolicy: normalized.value,
      policySource: 'custom'
    });
  } catch (error) {
    return next(error);
  }
}

async function clearUserPasswordPolicy(req, res, next) {
  try {
    const result = await requireManagedTarget(req, res, 'user_policy_cleared');

    if (result.response) {
      return result.response;
    }

    const reason = normalizeReason((req.body || {}).reason);

    if (!reason) {
      return res.status(400).json({
        message: 'reason is required.'
      });
    }

    const beforePolicy = await getEffectivePasswordPolicy(result.target);
    const globalPolicy = await getGlobalPasswordPolicy();

    await db.transaction(async (transaction) => {
      await transaction('users')
        .where('id', result.target.id)
        .update({
          password_policy_override: null,
          must_change_password: true
        });

      await writeSecurityAuditEvent({
        actorId: req.user.sub,
        targetUserId: result.target.id,
        eventType: 'user_policy_cleared',
        beforeValue: {
          source: beforePolicy.source,
          passwordPolicy: serializePolicy(beforePolicy)
        },
        afterValue: {
          source: 'global',
          passwordPolicy: serializePolicy(globalPolicy)
        },
        reason,
        outcome: 'completed'
      }, transaction);
    });

    return res.status(200).json({
      message: 'User now inherits the global password policy.',
      passwordPolicy: serializePolicy(globalPolicy),
      policySource: 'global'
    });
  } catch (error) {
    return next(error);
  }
}

async function getDelegates(req, res, next) {
  try {
    const delegates = await db('user_permissions as permission')
      .join('users as user', 'permission.user_id', 'user.id')
      .join('users as grantedBy', 'permission.granted_by', 'grantedBy.id')
      .leftJoin('units as unit', 'user.unit_id', 'unit.id')
      .select(
        'permission.id',
        'permission.created_at',
        'user.id as user_id',
        'user.username',
        'user.full_name',
        'user.role',
        'user.unit_id',
        'unit.name as unit_name',
        'user.is_active',
        'grantedBy.id as granted_by_id',
        'grantedBy.username as granted_by_username',
        'grantedBy.full_name as granted_by_full_name'
      )
      .where('permission.permission', 'security_admin')
      .orderBy('user.full_name', 'asc');

    return res.status(200).json({
      delegates: delegates.map((delegate) => ({
        id: delegate.user_id,
        username: delegate.username,
        fullName: delegate.full_name,
        role: delegate.role,
        unitId: delegate.unit_id,
        unitName: delegate.unit_name,
        isActive: delegate.is_active,
        grantedAt: delegate.created_at,
        grantedBy: {
          id: delegate.granted_by_id,
          username: delegate.granted_by_username,
          fullName: delegate.granted_by_full_name
        }
      }))
    });
  } catch (error) {
    return next(error);
  }
}

async function grantDelegate(req, res, next) {
  try {
    const reason = normalizeReason((req.body || {}).reason);

    if (!reason) {
      return res.status(400).json({
        message: 'reason is required.'
      });
    }

    const target = await db('users')
      .select('id', 'username', 'full_name', 'role', 'is_active', 'unit_id')
      .where('id', req.params.userId)
      .first();

    if (!target) {
      return res.status(404).json({
        message: 'User not found.'
      });
    }

    if (target.role !== 'admin' || !target.is_active) {
      return res.status(400).json({
        message: 'Security Administration access can be granted only to an active Admin user.'
      });
    }

    const existingPermission = await db('user_permissions')
      .select('id')
      .where({
        user_id: target.id,
        permission: 'security_admin'
      })
      .first();

    if (existingPermission) {
      return res.status(409).json({
        message: 'This Admin already has Security Administration access.'
      });
    }

    await db.transaction(async (transaction) => {
      await transaction('user_permissions').insert({
        user_id: target.id,
        permission: 'security_admin',
        granted_by: req.user.sub
      });

      await writeSecurityAuditEvent({
        actorId: req.user.sub,
        targetUserId: target.id,
        eventType: 'security_admin_granted',
        afterValue: {
          permission: 'security_admin'
        },
        reason,
        outcome: 'completed'
      }, transaction);
    });

    return res.status(201).json({
      message: 'Security Administration access has been granted.'
    });
  } catch (error) {
    return next(error);
  }
}

async function revokeDelegate(req, res, next) {
  try {
    const reason = normalizeReason((req.body || {}).reason);

    if (!reason) {
      return res.status(400).json({
        message: 'reason is required.'
      });
    }

    const permission = await db('user_permissions')
      .select('id', 'user_id')
      .where({
        user_id: req.params.userId,
        permission: 'security_admin'
      })
      .first();

    if (!permission) {
      return res.status(404).json({
        message: 'Security Administration access was not found for this user.'
      });
    }

    await db.transaction(async (transaction) => {
      await transaction('user_permissions')
        .where('id', permission.id)
        .delete();

      await writeSecurityAuditEvent({
        actorId: req.user.sub,
        targetUserId: permission.user_id,
        eventType: 'security_admin_revoked',
        beforeValue: {
          permission: 'security_admin'
        },
        reason,
        outcome: 'completed'
      }, transaction);
    });

    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
}

async function getSecurityAuditEvents(req, res, next) {
  try {
    const requestedLimit = Number(req.query.limit || 50);
    const limit = Number.isInteger(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), 100)
      : 50;

    const events = await db('security_audit_events as event')
      .leftJoin('users as actor', 'event.actor_id', 'actor.id')
      .leftJoin('users as target', 'event.target_user_id', 'target.id')
      .select(
        'event.id',
        'event.event_type',
        'event.before_value',
        'event.after_value',
        'event.reason',
        'event.outcome',
        'event.created_at',
        'actor.id as actor_id',
        'actor.username as actor_username',
        'actor.full_name as actor_full_name',
        'target.id as target_user_id',
        'target.username as target_username',
        'target.full_name as target_full_name'
      )
      .orderBy('event.created_at', 'desc')
      .limit(limit);

    return res.status(200).json({
      auditEvents: events.map((event) => ({
        id: event.id,
        eventType: event.event_type,
        beforeValue: event.before_value,
        afterValue: event.after_value,
        reason: event.reason,
        outcome: event.outcome,
        createdAt: event.created_at,
        actor: event.actor_id
          ? {
              id: event.actor_id,
              username: event.actor_username,
              fullName: event.actor_full_name
            }
          : null,
        targetUser: event.target_user_id
          ? {
              id: event.target_user_id,
              username: event.target_username,
              fullName: event.target_full_name
            }
          : null
      }))
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getPasswordPolicy,
  updatePasswordPolicy,
  getSecurityUsers,
  setUserPasswordPolicy,
  clearUserPasswordPolicy,
  getDelegates,
  grantDelegate,
  revokeDelegate,
  getSecurityAuditEvents
};
