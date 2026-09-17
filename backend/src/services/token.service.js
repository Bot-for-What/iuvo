const jwt = require('jsonwebtoken');

function getRequiredEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

function buildUserClaims(user) {
  return {
    sub: user.id,
    username: user.username,
    role: user.role,
    unitId: user.unit_id,
    departmentId: user.department_id,
    mustChangePassword: Boolean(user.must_change_password)
  };
}

function signAccessToken(user) {
  return jwt.sign(
    buildUserClaims(user),
    getRequiredEnv('JWT_SECRET'),
    {
      expiresIn: process.env.JWT_EXPIRES_IN || '8h'
    }
  );
}

function verifyAccessToken(token) {
  return jwt.verify(token, getRequiredEnv('JWT_SECRET'));
}

function signPendingTwoFactorToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      purpose: 'two_factor_login'
    },
    getRequiredEnv('PENDING_2FA_JWT_SECRET'),
    {
      expiresIn: process.env.PENDING_2FA_EXPIRES_IN || '5m'
    }
  );
}

function verifyPendingTwoFactorToken(token) {
  const payload = jwt.verify(token, getRequiredEnv('PENDING_2FA_JWT_SECRET'));

  if (payload.purpose !== 'two_factor_login') {
    throw new Error('Invalid pending 2FA token purpose.');
  }

  return payload;
}

module.exports = {
  signAccessToken,
  verifyAccessToken,
  signPendingTwoFactorToken,
  verifyPendingTwoFactorToken
};