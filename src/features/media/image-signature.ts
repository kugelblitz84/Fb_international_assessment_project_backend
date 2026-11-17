import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export function imageMime(data: Buffer): string {
  if (data.length > MAX_IMAGE_BYTES)
    throw new PayloadTooLargeException('Images must not exceed 2 MB.');
  if (
    data.length >= 24 &&
    data.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) &&
    data.toString('ascii', 12, 16) === 'IHDR' &&
    data.subarray(-8).equals(Buffer.from('49454e44ae426082', 'hex'))
  )
    return 'image/png';
  if (
    data.length >= 4 &&
    data[0] === 255 &&
    data[1] === 216 &&
    data[2] === 255 &&
    data[data.length - 2] === 255 &&
    data[data.length - 1] === 217
  )
    return 'image/jpeg';
  if (
    data.length >= 20 &&
    data.toString('ascii', 0, 4) === 'RIFF' &&
    data.toString('ascii', 8, 12) === 'WEBP' &&
    ['VP8 ', 'VP8L', 'VP8X'].includes(data.toString('ascii', 12, 16)) &&
    data.readUInt32LE(4) === data.length - 8
  )
    return 'image/webp';
  throw new BadRequestException(
    'A JPEG, PNG or WebP image signature is required.',
  );
}
