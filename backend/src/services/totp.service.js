const { authenticator } = require('otplib');
const QRCode = require('qrcode');
const { decrypt, encrypt } = require('./crypto.service');

function getIssuer() {
  return process.env.TOTP_ISSUER || 'IUVO';
}

async function createTotpSetup(username) {
  const secret = authenticator.generateSecret();
  const otpauthUrl = authenticator.keyuri(username, getIssuer(), secret);
  const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

  return {
    encryptedSecret: encrypt(secret),
    qrCodeDataUrl,
    manualSecret: secret
  };
}

function verifyTotp(encryptedSecret, token) {
  const secret = decrypt(encryptedSecret);
  return authenticator.check(token, secret);
}

module.exports = {
  createTotpSetup,
  verifyTotp
};
