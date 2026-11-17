import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
@Injectable()
export class RateLimitService {
  private readonly attempts = new Map<
    string,
    { count: number; reset: number }
  >();
  enforce(scope: string, ip: string, limit = 20) {
    const now = Date.now();
    for (const [key, value] of this.attempts)
      if (value.reset <= now) this.attempts.delete(key);
    const key = `${scope}:${ip}`;
    let bucket = this.attempts.get(key);
    if (!bucket) {
      if (this.attempts.size >= 10000)
        throw new HttpException(
          'Try again later.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      bucket = { count: 0, reset: now + 15 * 60000 };
      this.attempts.set(key, bucket);
    }
    if (++bucket.count > limit)
      throw new HttpException(
        'Too many authentication attempts.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
  }
}
