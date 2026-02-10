export type Category = 'MS' | 'WS' | 'MD' | 'WD' | 'XD';

export interface Player {
  id: string;
  name: string;
  alias: string;
  avatar?: string;
  phoneNumber?: string;
  registeredCategories: Category[];
}

export interface Match {
  id: string;
  round: number;
  player1: string | null; // Name or ID
  player2: string | null;
  score1?: number;
  score2?: number;
  winner?: string;
}

export const CATEGORIES: { id: Category; name: string }[] = [
  { id: 'MS', name: "Men's Singles" },
  { id: 'WS', name: "Women's Singles" },
  { id: 'MD', name: "Men's Doubles" },
  { id: 'WD', name: "Women's Doubles" },
  { id: 'XD', name: "Mixed Doubles" },
];
