/**
 * Generate standard tournament seeding order for a bracket of given size.
 * E.g., size 8  [1,8,4,5,2,7,3,6]  top seeds maximally separated,
 * seed 1 faces seed N, seed 2 faces seed N-1, etc.
 * 
 * Recursive logic:
 * - Base case: size 1 -> [1]
 * - Recursive step: size N -> fold size N/2. Each seed S in N/2 becomes [S, N+1-S].
 */
export function generateSeedOrder(bracketSize: number): number[] {
  if (bracketSize === 1) return [1];
  const half = generateSeedOrder(bracketSize / 2);
  const result: number[] = [];
  for (const seed of half) {
    result.push(seed);
    result.push(bracketSize + 1 - seed);
  }
  return result;
}

/**
 * Calculate the next power of 2 >= n for bracket size.
 * Minimum bracket size is 2.
 */
export function nextPowerOf2(n: number): number {
  if (n <= 2) return 2;
  // If already a power of 2, return as-is
  if ((n & (n - 1)) === 0) return n;
  // Find the next power of 2 by counting bit shifts
  let power = 1;
  while (power < n) {
    power <<= 1;
  }
  return power;
}
