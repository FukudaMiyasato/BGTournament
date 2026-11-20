export type Player = { id: string; name: string; photoV: number }; // photoV = 0 sin foto
export type Game = { id: string; name: string; photoV?: number }; // sin photoV = sin foto
export type Match = {
  id: string;
  gameId: string;
  date: string; // YYYY-MM-DD
  playerIds: string[];
  winnerIds: string[];
  createdAt: number;
};
export type DB = {
  players: Player[];
  games: Game[];
  matches: Match[];
  defaultPhotoV: number; // 0 = imagen por defecto original
};
export const emptyDB = (): DB => ({ players: [], games: [], matches: [], defaultPhotoV: 0 });
// Copia de seguridad: la base más las fotos (data URLs) por id; "default" = foto por defecto
export type Backup = DB & { photos: Record<string, string> };
export const DEFAULT_PHOTO_ID = "default";
