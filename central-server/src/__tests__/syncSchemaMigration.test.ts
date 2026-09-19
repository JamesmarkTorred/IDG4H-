import { execFileSync } from 'node:child_process';
import path from 'node:path';

describe('Prisma schema migration', () => {
  const centralServerRoot = path.resolve(__dirname, '../..');

  function runPrismaCommand(args: string[]): void {
    if (process.platform === 'win32') {
      execFileSync(
        process.env.ComSpec ?? 'cmd.exe',
        ['/d', '/s', '/c', `npx.cmd ${args.join(' ')}`],
        {
          cwd: centralServerRoot,
          stdio: 'pipe',
          env: process.env,
        },
      );
      return;
    }

    execFileSync(
      'npx',
      args,
      {
        cwd: centralServerRoot,
        stdio: 'pipe',
        env: process.env,
      },
    );
  }

  it('keeps the database schema in sync with Prisma migrations', () => {
    expect(() => {
      runPrismaCommand(['prisma', 'migrate', 'status']);
    }).not.toThrow();
  });

  it('validates the Prisma schema', () => {
    expect(() => {
      runPrismaCommand(['prisma', 'validate']);
    }).not.toThrow();
  });
});