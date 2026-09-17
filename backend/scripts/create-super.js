// backend/scripts/create-super.js
require('dotenv').config();

const readline = require('readline');
const db = require('../src/db/connection');
const { validateSuperPassword } = require('../src/services/password-policy.service');
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

function validateUsername(username) {
  return /^[a-zA-Z0-9._-]{3,50}$/.test(username);
}

async function main() {
  try {
    const existingSuper = await db('users')
      .select('id')
      .where('role', 'super')
      .first();

    if (existingSuper) {
      console.error('A Super account already exists.');
      process.exitCode = 1;
      return;
    }

    const username = (
      await ask('Super username (3-50 characters; letters, numbers, ., _, -): ')
    ).trim();

    if (!validateUsername(username)) {
      console.error(
        'Username must be 3-50 characters and use only letters, numbers, periods, underscores, or hyphens.'
      );
      process.exitCode = 1;
      return;
    }

    const fullName = (await ask('Super full name: ')).trim();

    if (!fullName) {
      console.error('Full name is required.');
      process.exitCode = 1;
      return;
    }

    const password = await ask(
      'Super password (12+ characters with uppercase, lowercase, number, and special character): ',
      { hidden: true }
    );
    const passwordConfirmation = await ask('Confirm Super password: ', {
      hidden: true
    });

    const passwordError = validateSuperPassword(password);

    if (passwordError) {
      console.error(passwordError);
      process.exitCode = 1;
      return;
    }

    if (password !== passwordConfirmation) {
      console.error('Passwords do not match.');
      process.exitCode = 1;
      return;
    }

    const passwordHash = await hashPassword(password);

    await db('users').insert({
      username,
      full_name: fullName,
      password_hash: passwordHash,
      role: 'super',
      unit_id: null,
      department_id: null,
      created_by: null,
      must_change_password: false
    });

    console.log(`Super account "${username}" was created successfully.`);
  } catch (error) {
    if (error.code === '23505') {
      console.error('A Super account already exists.');
      process.exitCode = 1;
      return;
    }

    console.error('Unable to create the Super account.');
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await db.destroy();
  }
}

main();