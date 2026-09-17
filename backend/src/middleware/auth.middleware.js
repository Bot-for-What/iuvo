const { verifyAccessToken } = require('../services/token.service');

const RESTRICTED_SESSION_AUTH_PATHS = new Set([
  '/me',
  '/change-password',
  '/logout'
]);

function isAllowedRestrictedSessionRequest(req) {
  return (
    req.baseUrl === '/auth' &&
    RESTRICTED_SESSION_AUTH_PATHS.has(req.path)
  );
}

function authenticate(req, res, next) {
  const authorizationHeader = req.get('authorization');

  if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      message: 'Authentication is required.'
    });
  }

  const token = authorizationHeader.slice('Bearer '.length).trim();

  if (!token) {
    return res.status(401).json({
      message: 'Authentication is required.'
    });
  }

  try {
    req.user = verifyAccessToken(token);

    if (
      req.user.mustChangePassword &&
      !isAllowedRestrictedSessionRequest(req)
    ) {
      return res.status(403).json({
        message: 'You must update your password before accessing this resource.',
        mustChangePassword: true
      });
    }

    return next();
  } catch (err) {
    return res.status(401).json({
      message: 'Your session is invalid or has expired.'
    });
  }
}

module.exports = {
  authenticate
};