import { Injectable } from '@nestjs/common';
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
const COST = 32768;
function derive(password: string, salt: string) {
  return new Promise<Buffer>((resolve, reject) =>
    scrypt(
      password,
      salt,
      32,
      { N: COST, r: 8, p: 1, maxmem: 64 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key)),
    ),
  );
}
@Injectable()
export class PasswordService {
  async hash(password: string) {
    const salt = randomBytes(16).toString('base64url');
    return `scrypt$${COST}$8$1$${salt}$${(await derive(password, salt)).toString('base64url')}`;
  }
  async verify(password: string, hash: string) {
    const [algorithm, cost, r, p, salt, key] = hash.split('$');
    if (
      algorithm !== 'scrypt' ||
      cost !== String(COST) ||
      r !== '8' ||
      p !== '1' ||
      !salt ||
      !key
    )
      return false;
    const expected = Buffer.from(key, 'base64url');
    const actual = await derive(password, salt);
    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
  }
  async dummyVerify(password: string) {
    await derive(password, 'autocare-unknown-user');
  }
}
