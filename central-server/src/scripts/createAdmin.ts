import 'dotenv/config';

import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

import { prisma } from '../db/connection';
import {
  createAdmin,
  AdminAlreadyExistsError,
  AdminValidationError,
} from '../auth/services/adminAuthenticationService';

async function main(): Promise<void> {
  const rl = readline.createInterface({
    input,
    output,
  });

  try {
    console.log('\nIDG4H Administrator Bootstrap\n');

    const email = await rl.question(
      'Administrator email: ',
    );

    const password = await rl.question(
      'Administrator password: ',
    );

    const confirmPassword = await rl.question(
      'Confirm administrator password: ',
    );

    if (password !== confirmPassword) {
      console.error('\nPasswords do not match.');
      process.exitCode = 1;
      return;
    }

    const admin = await createAdmin(
      email,
      password,
    );

    console.log('\nAdministrator created successfully.');
    console.log(`Email: ${admin.email}`);
    console.log(`Role: ${admin.role}`);
    console.log(`ID: ${admin.id}`);
  } catch (error) {
    if (
      error instanceof AdminValidationError ||
      error instanceof AdminAlreadyExistsError
    ) {
      console.error(`\n${error.message}`);
      process.exitCode = 1;
      return;
    }

    console.error(
      '\nFailed to create administrator:',
      error,
    );

    process.exitCode = 1;
  } finally {
    rl.close();
    await prisma.$disconnect();
  }
}

void main();