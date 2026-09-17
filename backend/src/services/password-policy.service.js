const crypto = require('crypto');
const db = require('../db/connection');

const POLICY_FIELDS = [
  'minLength',
  'requireUppercase',
  'requireLowercase',
  'requireNumber',
  'requireSpecialCharacter'
];

const SUPER_POLICY = Object.freeze({
  minLength: 12,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
  requireSpecialCharacter: true
});

const CHARACTER_SETS = {
  uppercase: 'ABCDEFGHJKLMNPQRSTUVWXYZ',
  lowercase: 'abcdefghijkmnopqrstuvwxyz',
  number: '23456789',
  special: '!@#$%^&*()-_=+[]{};:,.?'
};

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function normalizePolicy(policy) {
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) {
    return {
      error: 'Password policy must be an object.'
    };
  }

  const unknownFields = Object.keys(policy).filter((key) => !POLICY_FIELDS.includes(key));

  if (unknownFields.length > 0) {
    return {
      error: 'Password policy contains unsupported fields.'
    };
  }

  if (POLICY_FIELDS.some((field) => !hasOwn(policy, field))) {
    return {
      error: 'Password policy must include every required field.'
    };
  }

  if (
    !Number.isInteger(policy.minLength) ||
    policy.minLength < 3 ||
    policy.minLength > 128
  ) {
    return {
      error: 'minLength must be an integer between 3 and 128.'
    };
  }

  const booleanFields = POLICY_FIELDS.filter((field) => field !== 'minLength');

  if (booleanFields.some((field) => typeof policy[field] !== 'boolean')) {
    return {
      error: 'Password policy character requirements must be boolean values.'
    };
  }

  return {
    value: {
      minLength: policy.minLength,
      requireUppercase: policy.requireUppercase,
      requireLowercase: policy.requireLowercase,
      requireNumber: policy.requireNumber,
      requireSpecialCharacter: policy.requireSpecialCharacter
    }
  };
}

function settingsToPolicy(settings) {
  return {
    minLength: settings.min_password_length,
    requireUppercase: settings.require_uppercase,
    requireLowercase: settings.require_lowercase,
    requireNumber: settings.require_number,
    requireSpecialCharacter: settings.require_special_character
  };
}

function policyToSettings(policy) {
  return {
    min_password_length: policy.minLength,
    require_uppercase: policy.requireUppercase,
    require_lowercase: policy.requireLowercase,
    require_number: policy.requireNumber,
    require_special_character: policy.requireSpecialCharacter
  };
}

function validatePasswordAgainstPolicy(password, policy) {
  if (typeof password !== 'string') {
    return 'Password is required.';
  }

  if (password.length < policy.minLength) {
    return `Password must be at least ${policy.minLength} characters long.`;
  }

  if (policy.requireUppercase && !/[A-Z]/.test(password)) {
    return 'Password must include at least one uppercase letter.';
  }

  if (policy.requireLowercase && !/[a-z]/.test(password)) {
    return 'Password must include at least one lowercase letter.';
  }

  if (policy.requireNumber && !/\d/.test(password)) {
    return 'Password must include at least one number.';
  }

  if (policy.requireSpecialCharacter && !/[^A-Za-z0-9]/.test(password)) {
    return 'Password must include at least one special character.';
  }

  return null;
}

function validateSuperPassword(password) {
  return validatePasswordAgainstPolicy(password, SUPER_POLICY);
}

async function getGlobalPasswordPolicy(connection = db) {
  const settings = await connection('security_settings')
    .select(
      'min_password_length',
      'require_uppercase',
      'require_lowercase',
      'require_number',
      'require_special_character',
      'updated_by',
      'updated_at'
    )
    .where('id', 1)
    .first();

  if (!settings) {
    throw new Error('Global security settings are not configured.');
  }

  return {
    ...settingsToPolicy(settings),
    updatedBy: settings.updated_by,
    updatedAt: settings.updated_at
  };
}

async function getEffectivePasswordPolicy(user, connection = db) {
  if (!user || !user.role) {
    throw new Error('A user is required to resolve a password policy.');
  }

  if (user.role === 'super') {
    return {
      ...SUPER_POLICY,
      source: 'super_fixed'
    };
  }

  if (user.password_policy_override) {
    const normalized = normalizePolicy(user.password_policy_override);

    if (normalized.error) {
      throw new Error('Stored password policy override is invalid.');
    }

    return {
      ...normalized.value,
      source: 'custom'
    };
  }

  const globalPolicy = await getGlobalPasswordPolicy(connection);

  return {
    minLength: globalPolicy.minLength,
    requireUppercase: globalPolicy.requireUppercase,
    requireLowercase: globalPolicy.requireLowercase,
    requireNumber: globalPolicy.requireNumber,
    requireSpecialCharacter: globalPolicy.requireSpecialCharacter,
    source: 'global'
  };
}

function randomCharacter(characters) {
  return characters[crypto.randomInt(0, characters.length)];
}

function shuffle(characters) {
  for (let index = characters.length - 1; index > 0; index -= 1) {
    const replacementIndex = crypto.randomInt(0, index + 1);
    [characters[index], characters[replacementIndex]] = [
      characters[replacementIndex],
      characters[index]
    ];
  }

  return characters;
}

function generateTemporaryPassword(policy) {
  const minimumLength = Math.max(16, policy.minLength);
  const allCharacters = Object.values(CHARACTER_SETS).join('');
  const characters = [
    randomCharacter(CHARACTER_SETS.uppercase),
    randomCharacter(CHARACTER_SETS.lowercase),
    randomCharacter(CHARACTER_SETS.number),
    randomCharacter(CHARACTER_SETS.special)
  ];

  while (characters.length < minimumLength) {
    characters.push(randomCharacter(allCharacters));
  }

  const password = shuffle(characters).join('');
  const validationError = validatePasswordAgainstPolicy(password, policy);

  if (validationError) {
    throw new Error('Generated temporary password does not satisfy the active policy.');
  }

  return password;
}

module.exports = {
  POLICY_FIELDS,
  SUPER_POLICY,
  generateTemporaryPassword,
  getEffectivePasswordPolicy,
  getGlobalPasswordPolicy,
  normalizePolicy,
  policyToSettings,
  settingsToPolicy,
  validatePasswordAgainstPolicy,
  validateSuperPassword
};
