// Studios a los que puede pertenecer un participante
export const STUDIOS = {
  product: { label: "Product", color: "#3f7fe8" },
  movement: { label: "Movement", color: "#f0703c" },
  understanding: { label: "Understanding", color: "#9a5cf0" },
  operaciones: { label: "Operaciones", color: "#22a67a" },
  externo: { label: "Externo", color: "#6f7890" },
} as const;
export type StudioId = keyof typeof STUDIOS;
export const isStudio = (v: unknown): v is StudioId => typeof v === "string" && v in STUDIOS;

export type Player = { id: string; name: string; photoV: number; studio?: StudioId }; // photoV = 0 sin foto
export type Game = { id: string; name: string; photoV?: number }; // sin photoV = sin foto
// Una sesión es una jornada de juego: tiene fecha y agrupa partidas.
// Sus puntos cuentan en el ranking público solo cuando está subida (published).
export type Session = { id: string; date: string; published: boolean; createdAt: number }; // date YYYY-MM-DD
export type Match = {
  id: string;
  sessionId: string;
  gameId: string;
  playerIds: string[];
  places: string[]; // jugadores en orden de puesto: [1.º, 2.º, 3.º, …]
  createdAt: number;
};
export type DB = {
  players: Player[];
  games: Game[];
  sessions: Session[];
  matches: Match[];
  defaultPhotoV: number; // 0 = imagen por defecto original
  points: number[]; // puntos por puesto: [1.º, 2.º, 3.º, …]; los puestos siguientes dan 0
};
export const emptyDB = (): DB => ({ players: [], games: [], sessions: [], matches: [], defaultPhotoV: 0, points: [3, 2, 1] });
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
  // El studio "Talento" pasó a llamarse "Operaciones"
  db.players = db.players.map((p) =>
    (p.studio as string) === "talento" ? { ...p, studio: "operaciones" as const } : p,
  );
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
