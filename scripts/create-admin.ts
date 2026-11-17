import 'reflect-metadata';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { loadAppConfig } from '../src/core/config/app-config';
import { PrismaService } from '../src/core/database/prisma.service';
import { PasswordService } from '../src/features/auth/data/password.service';
import { register } from '../src/features/auth/registration.schemas';
async function main() {
  const config = loadAppConfig();
  const db = new PrismaService(config);
  let hidden = false;
  const output = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      if (!hidden) process.stdout.write(chunk);
      callback();
    },
  });
  const prompt = createInterface({
    input: process.stdin,
    output,
    terminal: !!process.stdin.isTTY,
  });
  try {
    const supplied = [
      process.env.ADMIN_NAME,
      process.env.ADMIN_EMAIL,
      process.env.ADMIN_PASSWORD,
    ];
    if (
      supplied.some((v) => v !== undefined) &&
      !supplied.every((v) => v !== undefined)
    )
      throw new Error(
        'Supply all of ADMIN_NAME, ADMIN_EMAIL and ADMIN_PASSWORD.',
      );
    let [name, email, password] = supplied;
    if (!supplied.every((v) => v !== undefined)) {
      if (!process.stdin.isTTY)
        throw new Error(
          'Use an interactive terminal or provide all ADMIN_* variables.',
        );
      name = await prompt.question('Administrator name: ');
      email = await prompt.question('Administrator email: ');
      process.stdout.write('Administrator password: ');
      hidden = true;
      try {
        password = await prompt.question('');
      } finally {
        hidden = false;
        process.stdout.write('\n');
      }
    }
    const input = register.safeParse({ name, email, password });
    if (!input.success)
      throw new Error(
        'Invalid administrator inputs: name 1�160 characters, valid email, password 10�256 characters required.',
      );
    const existing = await db.user.findUnique({
      where: { email: input.data.email },
      select: { id: true },
    });
    if (existing)
      throw new Error('Email already registered; no account was promoted.');
    const passwordHash = await new PasswordService().hash(input.data.password);
    await db.user.create({
      data: {
        name: input.data.name,
        email: input.data.email,
        passwordHash,
        status: 'ACTIVE',
        role: 'ADMIN',
      },
      select: { id: true },
    });
    process.stdout.write('Administrator created successfully.\n');
  } finally {
    prompt.close();
    await db.$disconnect();
  }
}
main().catch(() => {
  process.stderr.write(
    'Administrator creation failed. Check configuration, input requirements, database availability and email uniqueness.\n',
  );
  process.exitCode = 1;
});
