import argon2 from 'argon2';
import { prisma } from '../../db/connection';

export class AdminValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdminValidationError';
  }
}

export class AdminAlreadyExistsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdminAlreadyExistsError';
  }
}

export class AdminAuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdminAuthenticationError';
  }
}

function validateEmail(emailInput: string): string {
  const trimmed = (emailInput || '').trim();
  if (!trimmed) {
    throw new AdminValidationError('Email is required.');
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmed)) {
    throw new AdminValidationError('Invalid email format.');
  }

  return trimmed.toLowerCase();
}

function validatePassword(passwordInput: string): void {
  if (!passwordInput || passwordInput.trim() === '') {
    throw new AdminValidationError('Password is required.');
  }

  if (passwordInput.length < 8) {
    throw new AdminValidationError('Password must be at least 8 characters long.');
  }
}

export async function createAdmin(emailInput: string, passwordInput: string) {
  const normalizedEmail = validateEmail(emailInput);
  validatePassword(passwordInput);

  const existingAdmin = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (existingAdmin) {
    throw new AdminAlreadyExistsError(`Admin with email ${normalizedEmail} already exists.`);
  }

  const passwordHash = await argon2.hash(passwordInput);

  const admin = await prisma.user.create({
    data: {
      email: normalizedEmail,
      passwordHash,
      role: 'admin',
    },
    select: {
      id: true,
      email: true,
      role: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return admin;
}

export async function authenticateAdmin(emailInput: string, passwordInput: string) {
  const normalizedEmail = (emailInput || '').trim().toLowerCase();

  if (!normalizedEmail || !passwordInput) {
    throw new AdminAuthenticationError('Invalid email or password.');
  }

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (!user) {
    throw new AdminAuthenticationError('Invalid administrator credentials.');
  }

  const isPasswordValid = await argon2.verify(user.passwordHash, passwordInput);

  if (!isPasswordValid) {
    throw new AdminAuthenticationError('Invalid administrator credentials.');
  }

  const { passwordHash, ...adminWithoutPassword } = user;
  return adminWithoutPassword;
}
