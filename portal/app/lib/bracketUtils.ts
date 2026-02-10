import { Match, Player } from './types';

// Helper to find next power of 2
const nextPowerOf2 = (n: number) => {
  if (n === 0) return 0;
  return Math.pow(2, Math.ceil(Math.log2(n)));
};

export const generateSingleEliminationBracket = (participants: { id: string, name: string }[]): Match[] => {
  if (participants.length < 2) return [];

  const size = nextPowerOf2(participants.length);
  const byes = size - participants.length;
  
  // Simple matchmaking for MVP: Pair adjacent list items
  // In a real seeded tournament: 1 vs Size, 2 vs Size-1, etc.
  // Here we just take the list as is.
  
  const matches: Match[] = [];
  let matchCount = 1;

  // Round 1
  // We need 'size' slots.
  // The first (size - byes) / 2 matches differ from the bye matches?
  // Actually, standard approach:
  // Create first round with 'size/2' matches.
  // Populate them with participants.
  
  // Let's assume standard "Snake" or "Slaughter" seeding isn't required yet, just filling slots.
  
  // Strategy:
  // 1. Create a full tree of empty matches for N=size check.
  // 2. Fill leaf nodes with players.
  
  const totalRounds = Math.log2(size);
  let roundMatches: Match[] = [];

  // Generate all matches structure first
  // Round 1 has size/2 matches
  // Round 2 has size/4 matches ...
  let currentRoundSize = size / 2;
  
  for (let r = 1; r <= totalRounds; r++) {
      for (let m = 0; m < currentRoundSize; m++) {
          matches.push({
              id: `R${r}-M${m+1}`,
              round: r,
              player1: null,
              player2: null,
              score1: 0,
              score2: 0
          });
      }
      currentRoundSize /= 2;
  }

  // Now fill Round 1 with players
  // Matches in Round 1 are indices 0 to (size/2 - 1)
  const round1Matches = matches.filter(m => m.round === 1);
  
  // Distribute players and byes.
  // Byes usually go to top seeds. 
  // For MVP: Fill players into Player1 and Player2 slots sequentially.
  
  // If we have byes, we effectively have "Auto Wins" in Round 1.
  // Easier visualization: Just list participants.
  
  let pIndex = 0;
  
  round1Matches.forEach((match) => {
      // Slot 1
      if (pIndex < participants.length) {
          match.player1 = participants[pIndex].name; // simplified
          pIndex++;
      } else {
          match.player1 = "BYE";
      }
      
      // Slot 2
      if (pIndex < participants.length) {
          match.player2 = participants[pIndex].name;
          pIndex++;
      } else {
          match.player2 = "BYE";
      }

      // Auto-advance logic for Byes would go here in a real backend
  });

  return matches;
};
