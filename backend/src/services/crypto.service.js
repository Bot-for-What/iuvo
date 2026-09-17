const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

function getEncryptionKey() {
  const rawKey = process.env.TOTP_ENCRYPTION_KEY || '';

  if (!/^[0-9a-fA-F]{64}$/.test(rawKey)) {
    throw new Error('TOTP_ENCRYPTION_KEY must be exactly 64 hexadecimal characters.');
  }

  const key = Buffer.from(rawKey, 'hex');

  if (key.length !== KEY_LENGTH) {
    throw new Error('TOTP_ENCRYPTION_KEY must decode to 32 bytes.');
  }

  return key;
}

function encrypt(plaintext) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    iv.toString('base64url'),
    ciphertext.toString('base64url'),
    authTag.toString('base64url')
  ].join(':');
}

function decrypt(encryptedValue) {
  const parts = encryptedValue.split(':');

  if (parts.length !== 3) {
    throw new Error('Stored TOTP secret has an invalid format.');
  }

  const [ivValue, ciphertextValue, authTagValue] = parts;
  const iv = Buffer.from(ivValue, 'base64url');
  const ciphertext = Buffer.from(ciphertextValue, 'base64url');
  const authTag = Buffer.from(authTagValue, 'base64url');

  if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error('Stored TOTP secret has invalid encryption metadata.');
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, getEncryptionKey(), iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final()
  ]).toString('utf8');
}

module.exports = {
  encrypt,
  decrypt
};