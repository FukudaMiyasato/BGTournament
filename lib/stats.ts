import { DB, Game, Match, Player, Session } from "./types";

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
const expected = (a: number, b: number) => 1 / (1 + 10 ** ((b - a) / 400));

type Tally = Map<string, PlayerStat>;

// Elo de una partida grupal, con los puntajes de antes de la partida:
// - Cada jugador con puesto suma como si le hubiera ganado al mejor puntaje de los que quedaron debajo
//   (los puestos siguientes y los que no tienen puesto).
// - Los que no tienen puesto restan como si hubieran perdido contra el último puesto registrado.
// - Si todos tienen puesto, el último resta como si hubiera perdido contra el puesto anterior.
function applyElo(stats: Tally, m: Match) {
  const playing = m.playerIds.filter((id) => stats.has(id));
  const placed = m.places.filter((id) => playing.includes(id));
  if (!placed.length) return; // sin puestos no hay resultado
  const unplaced = playing.filter((id) => !placed.includes(id));
  const before = new Map(playing.map((id) => [id, stats.get(id)!.elo]));
  const rating = (id: string) => before.get(id)!;
  const k = (id: string) => (stats.get(id)!.played < ELO.newGames ? ELO.kNew : ELO.k);

  placed.forEach((id, i) => {
    const below = [...placed.slice(i + 1), ...unplaced];
    const s = stats.get(id)!;
    if (below.length) s.elo += k(id) * (1 - expected(rating(id), Math.max(...below.map(rating))));
    else if (i > 0) s.elo -= k(id) * expected(rating(id), rating(placed[i - 1]));
  });
  const last = placed[placed.length - 1];
  for (const id of unplaced) stats.get(id)!.elo -= k(id) * expected(rating(id), rating(last));
}

export function playerStats(db: DB, matches: Match[] = db.matches): PlayerStat[] {
  const map: Tally = new Map(
    db.players.map((p) => [
      p.id,
      { player: p, played: 0, elo: ELO.start, points: 0, wins: 0, seconds: 0, thirds: 0, losses: 0, winRate: 0 },
    ])
  );
  // En orden cronológico: el Elo depende de lo que pasó antes
  const order = new Map(sortedSessions(db).map((s, i) => [s.id, i]));
  const chronological = [...matches].sort(
    (a, b) => (order.get(a.sessionId) ?? 0) - (order.get(b.sessionId) ?? 0) || a.createdAt - b.createdAt
  );
  for (const m of chronological) {
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
    }
  }
  const list = [...map.values()];
  for (const s of list) s.winRate = s.played ? s.wins / s.played : 0;
  return list;
}

// Formas de ordenar el ranking
export const MODES = {
  elo: "Elo",
  wins: "Victorias",
  rate: "Promedio de victoria",
  points: "Puntos",
} as const;
export type Mode = keyof typeof MODES;

export type Ranked = PlayerStat & {
  rank: number; // mismo valor = mismo puesto; 0 si es provisional
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
  // Clasificados primero; a igual valor: más victorias, más segundos, más terceros, más partidas y nombre
  list.sort(
    (a, b) =>
      Number(a.provisional) - Number(b.provisional) ||
      b.score - a.score ||
      b.wins - a.wins ||
      b.seconds - a.seconds ||
      b.thirds - a.thirds ||
      b.played - a.played ||
      a.player.name.localeCompare(b.player.name)
  );
  list.forEach((s, i) => {
    if (s.provisional) return;
    s.rank = i > 0 && list[i - 1].score === s.score ? list[i - 1].rank : i + 1;
  });
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
