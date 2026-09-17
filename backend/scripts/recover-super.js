// backend/scripts/recover-super.js
require('dotenv').config();

const crypto = require('crypto');
const readline = require('readline');
const db = require('../src/db/connection');
const { validateSuperPassword } = require('../src/services/password-policy.service');
const { writeSecurityAuditEvent } = require('../src/services/security-audit.service');
const { hashPassword } = require('../src/services/password-hash.service');

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const input = process.stdin;
    const output = process.stdout;

    if (!hidden) {
      const prompt = readline.createInterface({ input, output });

      prompt.question(question, (answer) => {
        prompt.close();
        resolve(answer);
      });

      return;
    }

    let value = '';

    output.write(question);
    input.setRawMode(true);
    input.resume();
    input.setEncoding('utf8');

    const onData = (character) => {
      if (character === '\r' || character === '\n') {
        output.write('\n');
        input.setRawMode(false);
        input.pause();
        input.removeListener('data', onData);
        resolve(value);
        return;
      }

      if (character === '\u0003') {
        output.write('\n');
        process.exit(1);
      }

      if (character === '\u007F' || character === '\b') {
        value = value.slice(0, -1);
        return;
      }

      value += character;
    };

    input.on('data', onData);
  });
}

function recoveryKeyMatches(receivedKey, configuredKey) {
  const receivedBuffer = Buffer.from(receivedKey);
  const configuredBuffer = Buffer.from(configuredKey);

  if (receivedBuffer.length !== configuredBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(receivedBuffer, configuredBuffer);
}

async function main() {
  try {
    const configuredRecoveryKey = process.env.SUPER_RECOVERY_KEY;

    if (!configuredRecoveryKey) {
      console.error('SUPER_RECOVERY_KEY is required.');
      process.exitCode = 1;
      return;
    }

    const superUser = await db('users')
      .select('id', 'username', 'two_factor_enabled')
      .where('role', 'super')
      .first();

    if (!superUser) {
      console.error('No Super account exists.');
      process.exitCode = 1;
      return;
    }

    const recoveryKey = await ask('Super recovery key: ', { hidden: true });

    if (!recoveryKeyMatches(recoveryKey, configuredRecoveryKey)) {
      console.error('Recovery key is invalid.');
      process.exitCode = 1;
      return;
    }

    const reason = (await ask('Recovery reason: ')).trim();

    if (!reason) {
      console.error('Recovery reason is required.');
      process.exitCode = 1;
      return;
    }

    const password = await ask('New Super password: ', { hidden: true });
    const confirmation = await ask('Confirm new Super password: ', { hidden: true });

    if (password !== confirmation) {
      console.error('Passwords do not match.');
      process.exitCode = 1;
      return;
    }

    const passwordError = validateSuperPassword(password);

    if (passwordError) {
      console.error(passwordError);
      process.exitCode = 1;
      return;
    }

    const passwordHash = await hashPassword(password);

    await db.transaction(async (transaction) => {
      await transaction('users')
        .where('id', superUser.id)
        .update({
          password_hash: passwordHash,
          two_factor_enabled: false,
          two_factor_secret: null,
          must_change_password: false
        });

      await writeSecurityAuditEvent({
        actorId: null,
        targetUserId: superUser.id,
        eventType: 'super_recovered',
        beforeValue: {
          twoFactorEnabled: superUser.two_factor_enabled
        },
        afterValue: {
          twoFactorEnabled: false
        },
        reason,
        outcome: 'completed'
      }, transaction);
    });

    console.log(
      `Super account "${superUser.username}" recovered. Sign in with the new password and immediately re-enroll TOTP.`
    );
  } catch (error) {
    console.error('Unable to recover the Super account.');
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await db.destroy();
  }
}

main();