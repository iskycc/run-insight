import { createHash, timingSafeEqual } from 'node:crypto';

export function secretsEqual(
  expected: string | null | undefined,
  supplied: string | null | undefined,
): boolean {
  if (!expected || !supplied) return false;

  const expectedDigest = createHash('sha256').update(expected).digest();
  const suppliedDigest = createHash('sha256').update(supplied).digest();
  return timingSafeEqual(expectedDigest, suppliedDigest);
}
