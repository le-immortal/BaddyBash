export const SLOT_H = 110;
export const CONN_W = 28;
export const CARD_W = 256;
export const VISIBLE_ROUNDS = 4;

export function blockH(colIdx: number) {
  return SLOT_H * Math.pow(2, colIdx);
}

export function getRoundName(round: number, totalRounds: number): string {
  const r = totalRounds - round;
  if (r === 0) return 'Final';
  if (r === 1) return 'Semis';
  if (r === 2) return 'Quarters';
  return `R${round}`;
}

export const getCurrentSeasonFallback = () => String(new Date().getFullYear());
