// backend/src/services/password-hash.service.js
const bcrypt = require('bcryptjs');

const DEFAULT_BCRYPT_ROUNDS = 12;
const MIN_BCRYPT_ROUNDS = 10;
const MAX_BCRYPT_ROUNDS = 15;

const DUMMY_PASSWORD_HASHES = Object.freeze({
  10: '$2b$10$EXRkfkdmXn2gzds2SSitu.J8S5wGSb2oWLKuzGj8H9JjDa1WBzx2i',
  11: '$2b$11$EXRkfkdmXn2gzds2SSitu.J8S5wGSb2oWLKuzGj8H9JjDa1WBzx2i',
  12: '$2b$12$EXRkfkdmXn2gzds2SSitu.J8S5wGSb2oWLKuzGj8H9JjDa1WBzx2i',
  13: '$2b$13$EXRkfkdmXn2gzds2SSitu.J8S5wGSb2oWLKuzGj8H9JjDa1WBzx2i',
  14: '$2b$14$EXRkfkdmXn2gzds2SSitu.J8S5wGSb2oWLKuzGj8H9JjDa1WBzx2i',
  15: '$2b$15$EXRkfkdmXn2gzds2SSitu.J8S5wGSb2oWLKuzGj8H9JjDa1WBzx2i'
});

function parseBcryptRounds(value) {
  if (value === undefined || value === '') {
    return DEFAULT_BCRYPT_ROUNDS;
  }

  if (!/^\d+$/.test(value)) {
    throw new Error('BCRYPT_ROUNDS must be an integer between 10 and 15.');
  }

  const rounds = Number.parseInt(value, 10);

  if (rounds < MIN_BCRYPT_ROUNDS || rounds > MAX_BCRYPT_ROUNDS) {
    throw new Error('BCRYPT_ROUNDS must be an integer between 10 and 15.');
  }

  return rounds;
}

const BCRYPT_ROUNDS = parseBcryptRounds(process.env.BCRYPT_ROUNDS);
const DUMMY_PASSWORD_HASH = DUMMY_PASSWORD_HASHES[BCRYPT_ROUNDS];

if (!DUMMY_PASSWORD_HASH) {
  throw new Error(
    `No dummy bcrypt hash is configured for BCRYPT_ROUNDS=${BCRYPT_ROUNDS}.`
  );
}

function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

function comparePassword(password, passwordHash) {
  return bcrypt.compare(password, passwordHash);
}

function getDummyPasswordHash() {
  return DUMMY_PASSWORD_HASH;
}

module.exports = {
  BCRYPT_ROUNDS,
  hashPassword,
  comparePassword,
  getDummyPasswordHash
};