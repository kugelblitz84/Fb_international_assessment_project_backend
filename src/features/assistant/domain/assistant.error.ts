import { HttpException } from '@nestjs/common';
export function assistantError(status: number, code: string, message: string) {
  return new HttpException({ statusCode: status, code, message }, status);
}
