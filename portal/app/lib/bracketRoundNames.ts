export function getRoundName(round: number, totalRounds: number): string {
  const fromEnd = totalRounds - round;
  if (fromEnd === 0) return "Final";
  if (fromEnd === 1) return "Semis";
  if (fromEnd === 2) return "Quarters";
  return `Round ${round}`;
}

export function getPlayerStageLabel(round: number, totalRounds: number): string {
  const roundName = getRoundName(round, totalRounds);
  if (roundName === "Semis") return "Semifinalist";
  if (roundName === "Quarters") return "Quarterfinalist";
  if (roundName === "Final") return "Runner-up";

  const entrantsInRound = Math.pow(2, totalRounds - round + 1);
  return entrantsInRound > 0 ? `Round of ${entrantsInRound}` : roundName;
}
