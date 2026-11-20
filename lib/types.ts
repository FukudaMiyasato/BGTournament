export type Player = { id: string; name: string; photoV: number }; // photoV = 0 sin foto
export type Game = { id: string; name: string; photoV?: number }; // sin photoV = sin foto
// Una sesión es una jornada de juego: tiene fecha y agrupa partidas.
// Sus puntos cuentan en el ranking público solo cuando está subida (published).
export type Session = { id: string; date: string; published: boolean; createdAt: number }; // date YYYY-MM-DD
export type Match = {
  id: string;
  sessionId: string;
  gameId: string;
  playerIds: string[];
  places: string[]; // jugadores en orden de puesto: [1.º, 2.º, 3.º, …]; el 1.º gana 1 punto
  createdAt: number;
};
export type DB = {
  players: Player[];
  games: Game[];
  sessions: Session[];
  matches: Match[];
  defaultPhotoV: number; // 0 = imagen por defecto original
};
export const emptyDB = (): DB => ({ players: [], games: [], sessions: [], matches: [], defaultPhotoV: 0 });
// Copia de seguridad: la base más las fotos (data URLs) por id; "default" = foto por defecto
export type Backup = DB & { photos: Record<string, string> };
export const DEFAULT_PHOTO_ID = "default";

// Completa campos que falten y convierte datos antiguos a sesiones:
// las partidas con fecha o con temporada se agrupan en una sesión por día / temporada,
// y los "ganadores" pasan a ser los primeros puestos.
export function normalize(raw: Partial<DB> | null | undefined): DB {
  type LegacyMatch = Partial<Match> & { date?: string; season?: number; winnerIds?: string[] };
  const { publishedSeason = 0, ...rest } = (raw ?? {}) as Partial<DB> & { publishedSeason?: number };
  const db: DB = { ...emptyDB(), ...rest };
  db.sessions = [...db.sessions];
  db.matches = (db.matches as LegacyMatch[]).map(({ date, season, winnerIds, ...m }) => {
    let sessionId = m.sessionId;
    if (!sessionId) {
      sessionId = season ? `temporada${season}` : `dia${(date ?? "").replace(/\D/g, "")}`;
      if (!db.sessions.some((s) => s.id === sessionId)) {
        db.sessions.push({
          id: sessionId,
          date: date ?? new Date(m.createdAt || 0).toISOString().slice(0, 10),
          published: season ? season <= publishedSeason : true,
          createdAt: season ?? m.createdAt ?? 0,
        });
      }
    }
    return { ...m, sessionId, places: m.places ?? winnerIds ?? [] } as Match;
  });
  return db;
}
