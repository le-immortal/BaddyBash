/**
 * Generate standard tournament seeding order for a bracket of given size.
 * Produces the canonical draw where seed 1 and 2 can only meet in the final,
 * 1/2/3/4 can only meet in semis, etc.
 *
 * E.g., size 16: [1,16, 9,8, 5,12, 13,4, 3,14, 11,6, 7,10, 15,2]
 *
 * Algorithm: build the list of "player-1" slots by iteratively inserting
 * complement positions (s + half), then pair each with its complement (n+1-s).
 */
export function generateSeedOrder(bracketSize: number): number[] {
  // Build top-seed positions: start with [1], expand by inserting s+half for each half
  let p1Seeds = [1];
  for (let half = 2; half <= bracketSize / 2; half <<= 1) {
    const expanded: number[] = [];
    for (const s of p1Seeds) {
      expanded.push(s);
      expanded.push(s + half);
    }
    p1Seeds = expanded;
  }
  // Interleave each top seed with its complement to form match pairs
  const result: number[] = [];
  for (const s of p1Seeds) {
    result.push(s);
    result.push(bracketSize + 1 - s);
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
