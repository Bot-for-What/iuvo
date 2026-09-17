const db = require('../db/connection');
const {
  signAccessToken,
  signPendingTwoFactorToken,
  verifyPendingTwoFactorToken
} = require('../services/token.service');
const { createTotpSetup, verifyTotp } = require('../services/totp.service');
const {
  getEffectivePasswordPolicy,
  validatePasswordAgainstPolicy
} = require('../services/password-policy.service');
const {
  hashPassword,
  comparePassword,
  getDummyPasswordHash
} = require('../services/password-hash.service');

function serializeUser(user) {
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
    twoFactorEnabled: user.two_factor_enabled,
    mustChangePassword: Boolean(user.must_change_password)
  };
}

function selectLoginUser(query) {
  return query.select(
    'u.id',
    'u.username',
    'u.password_hash',
    'u.full_name',
    'u.role',
    'u.unit_id',
    'unit.name as unit_name',
    'u.department_id',
    'department.name as department_name',
    'u.staff_department_id',
    'u.is_active',
    'u.two_factor_enabled',
    'u.two_factor_secret',
    'u.must_change_password',
    'u.password_policy_override',
    'unit.is_active as unit_is_active',
    'ud.is_active as unit_department_is_active',
    'sd.is_active as staff_department_is_active'
  );
}

async function findLoginEligibleUser(username) {
  const query = db('users as u')
    .leftJoin('units as unit', 'u.unit_id', 'unit.id')
    .leftJoin('departments as department', 'u.department_id', 'department.id')
    .leftJoin('unit_departments as ud', function joinUnitDepartments() {
      this.on('ud.unit_id', '=', 'u.unit_id')
        .andOn('ud.department_id', '=', 'u.department_id');
    })
    .leftJoin('staff_departments as sd', 'sd.id', 'u.staff_department_id')
    .where('u.username', username)
    .first();

  return selectLoginUser(query);
}

function canUserLogIn(user) {
  if (!user || !user.is_active) {
    return false;
  }

  if (user.role === 'super' || user.role === 'management') {
    return true;
  }

  if (!user.unit_is_active) {
    return false;
  }

  if (user.role === 'staff') {
    return Boolean(user.staff_department_is_active);
  }

  return Boolean(user.unit_department_is_active);
}

async function login(req, res, next) {
  try {
    const { username, password } = req.body || {};

    if (typeof username !== 'string' || typeof password !== 'string') {
      return res.status(400).json({
        message: 'Username and password are required.'
      });
    }

    // Awaiting this before the lookup makes the initial post-startup attempt
    // equally expensive whether or not the submitted username exists.
    const dummyPasswordHash = await getDummyPasswordHash();
    const user = await findLoginEligibleUser(username.trim());
    const passwordMatches = await comparePassword(
      password,
      user ? user.password_hash : dummyPasswordHash
    );

    if (!user || !passwordMatches || !canUserLogIn(user)) {
      return res.status(401).json({
        message: 'Invalid username or password.'
      });
    }

    if (user.two_factor_enabled) {
      if (!user.two_factor_secret) {
        return res.status(500).json({
          message: 'Two-factor authentication is misconfigured for this account.'
        });
      }

      return res.status(200).json({
        requiresTwoFactor: true,
        pending_2fa_token: signPendingTwoFactorToken(user)
      });
    }

    return res.status(200).json({
      requiresTwoFactor: false,
      token: signAccessToken(user),
      user: serializeUser(user)
    });
  } catch (error) {
    return next(error);
  }
}

async function verifyTwoFactorLogin(req, res, next) {
  try {
    const { pending_2fa_token: pendingToken, otp } = req.body || {};

    if (typeof pendingToken !== 'string' || typeof otp !== 'string') {
      return res.status(400).json({
        message: 'pending_2fa_token and otp are required.'
      });
    }

    let pendingClaims;

    try {
      pendingClaims = verifyPendingTwoFactorToken(pendingToken);
    } catch {
      return res.status(401).json({
        message: 'Your two-factor verification request is invalid or has expired.'
      });
    }

const query = db('users as u')
  .leftJoin('units as unit', 'u.unit_id', 'unit.id')
  .leftJoin('departments as department', 'u.department_id', 'department.id')
  .leftJoin('unit_departments as ud', function joinUnitDepartments() {
    this.on('ud.unit_id', '=', 'u.unit_id')
      .andOn('ud.department_id', '=', 'u.department_id');
  })
  .leftJoin('staff_departments as sd', 'sd.id', 'u.staff_department_id')
  .where('u.id', pendingClaims.sub)
  .first();

    const user = await selectLoginUser(query);

    if (!canUserLogIn(user) || !user.two_factor_enabled || !user.two_factor_secret) {
      return res.status(401).json({
        message: 'Your two-factor verification request is no longer valid.'
      });
    }

    const normalizedOtp = otp.replace(/\s+/g, '');

    if (!/^\d{6}$/.test(normalizedOtp)) {
      return res.status(400).json({
        message: 'OTP must be a 6-digit code.'
      });
    }

    if (!verifyTotp(user.two_factor_secret, normalizedOtp)) {
      return res.status(401).json({
        message: 'Invalid authentication code.'
      });
    }

    return res.status(200).json({
      token: signAccessToken(user),
      user: serializeUser(user)
    });
  } catch (error) {
    return next(error);
  }
}

async function logout(req, res) {
  return res.status(204).send();
}

async function changePassword(req, res, next) {
  try {
    const { currentPassword, newPassword } = req.body || {};

    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
      return res.status(400).json({
        message: 'currentPassword and newPassword are required.'
      });
    }

    const user = await db('users')
      .select(
        'id',
        'username',
        'password_hash',
        'full_name',
        'role',
        'unit_id',
        'department_id',
        'is_active',
        'two_factor_enabled',
        'must_change_password',
        'password_policy_override'
      )
      .where('id', req.user.sub)
      .first();

    if (!user || !(await comparePassword(currentPassword, user.password_hash))) {
      return res.status(401).json({
        message: 'Current password is incorrect.'
      });
    }

    const policy = await getEffectivePasswordPolicy(user);
    const passwordError = validatePasswordAgainstPolicy(newPassword, policy);

    if (passwordError) {
      return res.status(400).json({
        message: passwordError
      });
    }

    const passwordHash = await hashPassword(newPassword);

    const [updatedUser] = await db('users')
      .where('id', user.id)
      .update({
        password_hash: passwordHash,
        must_change_password: false
      })
      .returning([
        'id',
        'username',
        'full_name',
        'role',
        'unit_id',
        'department_id',
        'is_active',
        'two_factor_enabled',
        'must_change_password'
      ]);

    return res.status(200).json({
      token: signAccessToken(updatedUser),
      user: serializeUser(updatedUser)
    });
  } catch (error) {
    return next(error);
  }
}

async function getCurrentUser(req, res, next) {
  try {
    const user = await db('users as u')
      .leftJoin('units as unit', 'u.unit_id', 'unit.id')
      .leftJoin('departments as department', 'u.department_id', 'department.id')
      .leftJoin('staff_departments as sd', 'sd.id', 'u.staff_department_id')
      .select(
        'u.id',
        'u.username',
        'u.full_name',
        'u.role',
        'u.unit_id',
        'unit.name as unit_name',
        'u.department_id',
        'department.name as department_name',
        'u.staff_department_id',
        'sd.name as staff_department_name',
        'u.is_active',
        'u.two_factor_enabled',
        'u.must_change_password'
      )
      .where('u.id', req.user.sub)
      .first();

    if (!user) {
      return res.status(404).json({
        message: 'User not found.'
      });
    }

    // For staff users, use staff_department_name; for others, use department_name
    const serializedUser = serializeUser(user);
    if (user.role === 'staff' && user.staff_department_name) {
      serializedUser.departmentName = user.staff_department_name;
    }

    return res.status(200).json(serializedUser);
  } catch (error) {
    return next(error);
  }
}

async function updateTwoFactor(req, res, next) {
  try {
    const { enabled } = req.body || {};

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({
        message: 'enabled must be a boolean.'
      });
    }

    const targetUser = await db('users')
      .select(
        'id',
        'username',
        'full_name',
        'role',
        'unit_id',
        'department_id',
        'is_active',
        'two_factor_enabled',
        'must_change_password'
      )
      .where('id', req.params.id)
      .first();

    if (!targetUser) {
      return res.status(404).json({
        message: 'User not found.'
      });
    }

    if (!enabled) {
      const [updatedUser] = await db('users')
        .where('id', targetUser.id)
        .update({
          two_factor_enabled: false,
          two_factor_secret: null
        })
        .returning([
          'id',
          'username',
          'full_name',
          'role',
          'unit_id',
          'department_id',
          'is_active',
          'two_factor_enabled',
          'must_change_password'
        ]);

      return res.status(200).json({
        message: 'Two-factor authentication has been disabled.',
        user: serializeUser(updatedUser)
      });
    }

    const setup = await createTotpSetup(targetUser.username);

    const [updatedUser] = await db('users')
      .where('id', targetUser.id)
      .update({
        two_factor_enabled: true,
        two_factor_secret: setup.encryptedSecret
      })
      .returning([
        'id',
        'username',
        'full_name',
        'role',
        'unit_id',
        'department_id',
        'is_active',
        'two_factor_enabled',
        'must_change_password'
      ]);

    return res.status(200).json({
      message: 'Two-factor authentication has been enabled. Save the setup secret now; it will not be shown again.',
      user: serializeUser(updatedUser),
      twoFactorSetup: {
        qrCodeDataUrl: setup.qrCodeDataUrl,
        manualSecret: setup.manualSecret
      }
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  login,
  verifyTwoFactorLogin,
  logout,
  changePassword,
  getCurrentUser,
  updateTwoFactor
};