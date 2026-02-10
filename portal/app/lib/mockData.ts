import { Match, Player } from './types';

export const CURRENT_USER: Player = {
  id: 'u1',
  name: 'Abhishek Sharma',
  alias: 'sharmaabh',
  phoneNumber: '',
  registeredCategories: ['MS'],
};

export const MOCK_PLAYERS: Player[] = [
  { id: 'u1', name: 'Abhishek Sharma', alias: 'sharmaabh', registeredCategories: ['MS'] },
  { id: 'u2', name: 'John Doe', alias: 'jdoe', registeredCategories: ['MD', 'XD'] },
  { id: 'u3', name: 'Jane Smith', alias: 'jsmith', registeredCategories: ['WS', 'XD'] },
  { id: 'u4', name: 'Mike Johnson', alias: 'mjohnson', registeredCategories: ['MS', 'MD'] },
  { id: 'u5', name: 'Sarah Wilson', alias: 'swilson', registeredCategories: ['WD'] },
];

export const MOCK_BRACKET_MS: Match[] = [
  { id: 'm1', round: 1, player1: 'Abhishek Sharma', player2: 'Mike Johnson', score1: 0, score2: 0 },
  { id: 'm2', round: 1, player1: 'Player 3', player2: 'Player 4', score1: 0, score2: 0 },
  { id: 'm3', round: 2, player1: 'Winner M1', player2: 'Winner M2', score1: 0, score2: 0 },
];
