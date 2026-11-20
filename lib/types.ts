export type Player = { id: string; name: string; photoV: number }; // photoV = 0 sin foto
export type Game = { id: string; name: string };
export type Match = {
  id: string;
  gameId: string;
  date: string; // YYYY-MM-DD
  playerIds: string[];
  winnerIds: string[];
  createdAt: number;
};
export type DB = { players: Player[]; games: Game[]; matches: Match[] };
export const emptyDB = (): DB => ({ players: [], games: [], matches: [] });
