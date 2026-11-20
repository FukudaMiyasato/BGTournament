export type Player = { id: string; name: string; photoV: number }; // photoV = 0 sin foto
export type Game = { id: string; name: string; photoV?: number }; // sin photoV = sin foto
export type Match = {
  id: string;
  gameId: string;
  season: number; // temporada 1, 2, 3…
  playerIds: string[];
  winnerIds: string[];
  createdAt: number;
};
export type DB = {
  players: Player[];
  games: Game[];
  matches: Match[];
  defaultPhotoV: number; // 0 = imagen por defecto original
  // Temporadas 1..publishedSeason ya están subidas (cuentan en el ranking público).
  // La temporada publishedSeason + 1 es la que se está preparando.
  publishedSeason: number;
};
export const emptyDB = (): DB => ({ players: [], games: [], matches: [], defaultPhotoV: 0, publishedSeason: 0 });
// Copia de seguridad: la base más las fotos (data URLs) por id; "default" = foto por defecto
export type Backup = DB & { photos: Record<string, string> };
export const DEFAULT_PHOTO_ID = "default";

// Completa campos que falten y convierte datos antiguos (partidas con fecha) a temporadas:
// cada día distinto pasa a ser una temporada consecutiva, ya subida.
export function normalize(raw: Partial<DB> | null | undefined): DB {
  const db: DB = { ...emptyDB(), ...(raw ?? {}) };
  type Legacy = Match & { date?: string };
  const legacy = db.matches as Legacy[];
  if (legacy.some((m) => !m.season)) {
    const base = Math.max(0, ...legacy.map((m) => m.season || 0));
    const days = [...new Set(legacy.filter((m) => !m.season).map((m) => m.date ?? ""))].sort();
    db.matches = legacy.map(({ date, ...m }) =>
      m.season ? m : { ...m, season: base + days.indexOf(date ?? "") + 1 }
    );
    db.publishedSeason = Math.max(db.publishedSeason, ...db.matches.map((m) => m.season));
  }
  return db;
}
