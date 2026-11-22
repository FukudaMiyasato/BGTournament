import { DB, Game, Match, Player, STUDIOS, Session, StudioId } from "./types";

export type PlayerStat = {
  player: Player;
  played: number;
  elo: number;
  points: number; // según db.points y el puesto en cada partida
  wins: number; // primeros puestos
  seconds: number;
  thirds: number;
  losses: number; // jugó y no quedó primero
  winRate: number; // 0..1
  since: Record<Mode, number>; // n.º de la partida (en orden) en que llegó a su valor actual en cada modo
};
export type GameStat = { game: Game; played: number; topWinner: Player | null; topWins: number };

// Elo
export const ELO = {
  start: 1000, // todos empiezan aquí
  k: 32, // cuánto se mueve como máximo por partida
  kNew: 48, // K de las primeras partidas, para que los nuevos lleguen rápido a su nivel
  newGames: 5,
  minGames: 3, // partidas mínimas para aparecer clasificado (Elo y promedio)
};
// Probabilidad de que `a` le gane a `b` según sus puntajes
export const expected = (a: number, b: number) => 1 / (1 + 10 ** ((b - a) / 400));
const average = (xs: number[]) => xs.reduce((sum, x) => sum + x, 0) / xs.length;

type Tally = Map<string, PlayerStat>;

// Cambio de Elo de cada jugador en una partida grupal, con los puntajes de antes de la partida:
// - Cada jugador con puesto suma como en un duelo ganado contra el promedio de los que quedaron debajo
//   (los puestos siguientes y los que no tienen puesto). El 1.º se mide contra el promedio de todos los demás.
// - Los que no tienen puesto restan como si hubieran perdido contra el último puesto registrado.
// - Si todos tienen puesto, el último resta como si hubiera perdido contra el puesto anterior.
export function eloChanges(
  rating: (id: string) => number,
  k: (id: string) => number,
  playing: string[],
  places: string[]
): Map<string, number> {
  const changes = new Map<string, number>();
  const placed = places.filter((id) => playing.includes(id));
  if (!placed.length) return changes; // sin puestos no hay resultado
  const unplaced = playing.filter((id) => !placed.includes(id));
  placed.forEach((id, i) => {
    const below = [...placed.slice(i + 1), ...unplaced];
    if (below.length) changes.set(id, k(id) * (1 - expected(rating(id), average(below.map(rating)))));
    else if (i > 0) changes.set(id, -k(id) * expected(rating(id), rating(placed[i - 1])));
  });
  const last = placed[placed.length - 1];
  for (const id of unplaced) changes.set(id, -k(id) * expected(rating(id), rating(last)));
  return changes;
}

function applyElo(stats: Tally, m: Match) {
  const changes = eloChanges(
    (id) => stats.get(id)!.elo,
    (id) => (stats.get(id)!.played < ELO.newGames ? ELO.kNew : ELO.k),
    m.playerIds.filter((id) => stats.has(id)),
    m.places
  );
  for (const [id, change] of changes) stats.get(id)!.elo += change;
}

export function playerStats(db: DB, matches: Match[] = db.matches): PlayerStat[] {
  const map: Tally = new Map(
    db.players.map((p) => [
      p.id,
      { player: p, played: 0, elo: ELO.start, points: 0, wins: 0, seconds: 0, thirds: 0, losses: 0, winRate: 0, since: { elo: 0, wins: 0, rate: 0, points: 0 } },
    ])
  );
  // En orden cronológico: el Elo depende de lo que pasó antes
  const order = new Map(sortedSessions(db).map((s, i) => [s.id, i]));
  const chronological = [...matches].sort(
    (a, b) => (order.get(a.sessionId) ?? 0) - (order.get(b.sessionId) ?? 0) || a.createdAt - b.createdAt
  );
  const modes = Object.keys(MODES) as Mode[];
  chronological.forEach((m, n) => {
    const playing = m.playerIds.flatMap((id) => map.get(id) ?? []);
    const was = playing.map((s) => modes.map((mode) => SCORE[mode](s).score));
    applyElo(map, m); // antes de contar la partida: el K depende de las jugadas hasta ahora
    for (const id of m.playerIds) {
      const s = map.get(id);
      if (!s) continue;
      s.played++;
      const place = m.places.indexOf(id);
      if (place >= 0) s.points += db.points[place] ?? 0;
      if (place === 0) s.wins++;
      else s.losses++;
      if (place === 1) s.seconds++;
      if (place === 2) s.thirds++;
      s.winRate = s.wins / s.played;
    }
    // Para el desempate: se anota cuándo cambió el valor de cada jugador
    playing.forEach((s, i) =>
      modes.forEach((mode, j) => {
        if (SCORE[mode](s).score !== was[i][j]) s.since[mode] = n + 1;
      })
    );
  });
  return [...map.values()];
}

// Formas de ordenar el ranking
export const MODES = {
  elo: "Elo",
  wins: "Partidas ganadas",
  rate: "Promedio de victoria",
  points: "Puntos",
} as const;
export type Mode = keyof typeof MODES;

export type Ranked = PlayerStat & {
  rank: number; // puesto único; los provisionales van después de los clasificados
  score: number; // valor por el que se ordena
  text: string; // valor a mostrar
  unit: string;
  provisional: boolean; // aún no tiene las partidas mínimas (solo Elo y promedio)
};

const SCORE: Record<Mode, (s: PlayerStat) => { score: number; text: string; unit: string }> = {
  elo: (s) => ({ score: Math.round(s.elo), text: String(Math.round(s.elo)), unit: "Elo" }),
  wins: (s) => ({ score: s.wins, text: String(s.wins), unit: s.wins === 1 ? "victoria" : "victorias" }),
  rate: (s) => ({ score: Math.round(s.winRate * 100), text: `${Math.round(s.winRate * 100)}%`, unit: "ganadas" }),
  points: (s) => ({ score: s.points, text: String(s.points), unit: s.points === 1 ? "punto" : "puntos" }),
};

// Ranking visible: solo quienes jugaron al menos una partida.
export function ranking(db: DB, mode: Mode, matches: Match[] = db.matches): Ranked[] {
  const needsMin = mode === "elo" || mode === "rate";
  const list: Ranked[] = playerStats(db, matches)
    .filter((s) => s.played > 0)
    .map((s) => ({ ...s, ...SCORE[mode](s), rank: 0, provisional: needsMin && s.played < ELO.minGames }));
  // Clasificados primero; a igual valor va primero quien llegó antes a ese valor
  list.sort(
    (a, b) =>
      Number(a.provisional) - Number(b.provisional) ||
      b.score - a.score ||
      a.since[mode] - b.since[mode] ||
      b.wins - a.wins ||
      b.seconds - a.seconds ||
      b.thirds - a.thirds ||
      b.played - a.played ||
      a.player.name.localeCompare(b.player.name)
  );
  list.forEach((s, i) => (s.rank = i + 1));
  return list;
}

// Sesiones en orden cronológico; su número (Sesión 1, 2, 3…) es la posición en esta lista.
export function sortedSessions(db: DB): Session[] {
  return [...db.sessions].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
}

// Ranking anterior: el mismo cálculo sin la última sesión subida.
// No se guarda nada aparte: sale de las partidas de cada sesión.
export function previousRanking(db: DB, mode: Mode): { last: Session | null; number: number; prev: Ranked[] } {
  const published = sortedSessions(db).filter((s) => s.published);
  const last = published.at(-1) ?? null;
  const ids = new Set(published.slice(0, -1).map((s) => s.id));
  return { last, number: published.length, prev: ranking(db, mode, db.matches.filter((m) => ids.has(m.sessionId))) };
}

export function gameStats(db: DB): GameStat[] {
  const players = new Map(db.players.map((p) => [p.id, p]));
  return db.games
    .map((game) => {
      const ms = db.matches.filter((m) => m.gameId === game.id);
      const wins = new Map<string, number>();
      for (const m of ms) if (m.places[0]) wins.set(m.places[0], (wins.get(m.places[0]) ?? 0) + 1);
      const top = [...wins.entries()].sort((a, b) => b[1] - a[1])[0];
      return {
        game,
        played: ms.length,
        topWinner: top ? players.get(top[0]) ?? null : null,
        topWins: top ? top[1] : 0,
      };
    })
    .sort((a, b) => b.played - a.played || a.game.name.localeCompare(b.game.name));
}

// Partidas de la más reciente a la más antigua
export function sortedMatches(db: DB): Match[] {
  const order = new Map(sortedSessions(db).map((s, i) => [s.id, i]));
  return [...db.matches].sort(
    (a, b) => (order.get(b.sessionId) ?? 0) - (order.get(a.sessionId) ?? 0) || b.createdAt - a.createdAt
  );
}

export function formatDate(d: string) {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day).toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" });
}

// Studios que compiten entre sí (los externos no son un área)
export const TEAM_STUDIOS = (Object.keys(STUDIOS) as StudioId[]).filter((id) => id !== "externo");

// Victorias (primeros puestos) de cada studio, sumando las de sus jugadores
export function studioWins(db: DB): { studio: StudioId; wins: number }[] {
  const studioOf = new Map(db.players.map((p) => [p.id, p.studio]));
  return TEAM_STUDIOS.map((studio) => ({
    studio,
    wins: db.matches.filter((m) => m.places[0] && studioOf.get(m.places[0]) === studio).length,
  }));
}

export const MVP_DAYS = 30;
// MVP de cada studio: quien más partidas ganó en los últimos 30 días (si empatan, lo son todos)
export function mvps(db: DB, today = new Date()): Set<string> {
  const from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - MVP_DAYS);
  const since = [from.getFullYear(), from.getMonth() + 1, from.getDate()].map((n) => String(n).padStart(2, "0")).join("-");
  const recent = new Set(db.sessions.filter((s) => s.date >= since).map((s) => s.id));
  const wins = new Map<string, number>();
  for (const m of db.matches)
    if (recent.has(m.sessionId) && m.places[0]) wins.set(m.places[0], (wins.get(m.places[0]) ?? 0) + 1);
  const best = new Map<StudioId, number>();
  for (const p of db.players)
    if (p.studio) best.set(p.studio, Math.max(best.get(p.studio) ?? 0, wins.get(p.id) ?? 0));
  return new Set(
    db.players.filter((p) => p.studio && wins.get(p.id) && wins.get(p.id) === best.get(p.studio)).map((p) => p.id)
  );
}
