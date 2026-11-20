import { DB, Game, Match, Player, Session } from "./types";

export type PlayerStat = {
  player: Player;
  played: number;
  points: number; // 1 punto por cada primer puesto
  seconds: number;
  thirds: number;
  losses: number; // jugó y no quedó primero
  winRate: number; // 0..1
  rank: number;
};
export type GameStat = { game: Game; played: number; topWinner: Player | null; topWins: number };

export function playerStats(db: DB, matches: Match[] = db.matches): PlayerStat[] {
  const map = new Map(
    db.players.map((p) => [
      p.id,
      { player: p, played: 0, points: 0, seconds: 0, thirds: 0, losses: 0, winRate: 0, rank: 0 },
    ])
  );
  for (const m of matches) {
    for (const id of m.playerIds) {
      const s = map.get(id);
      if (!s) continue;
      s.played++;
      const place = m.places.indexOf(id);
      if (place === 0) s.points++;
      else s.losses++;
      if (place === 1) s.seconds++;
      if (place === 2) s.thirds++;
    }
  }
  const list = [...map.values()];
  for (const s of list) s.winRate = s.played ? s.points / s.played : 0;
  // Desempate de orden: más segundos puestos, más terceros, mejor % y nombre
  list.sort(
    (a, b) =>
      b.points - a.points ||
      b.seconds - a.seconds ||
      b.thirds - a.thirds ||
      b.winRate - a.winRate ||
      a.player.name.localeCompare(b.player.name)
  );
  // Mismos puntos = mismo puesto
  list.forEach((s, i) => {
    s.rank = i > 0 && list[i - 1].points === s.points ? list[i - 1].rank : i + 1;
  });
  return list;
}

// Ranking visible: solo quienes jugaron al menos una partida.
export function ranking(db: DB, matches: Match[] = db.matches): PlayerStat[] {
  const list = playerStats(db, matches).filter((s) => s.played > 0);
  list.forEach((s, i) => {
    s.rank = i > 0 && list[i - 1].points === s.points ? list[i - 1].rank : i + 1;
  });
  return list;
}

// Sesiones en orden cronológico; su número (Sesión 1, 2, 3…) es la posición en esta lista.
export function sortedSessions(db: DB): Session[] {
  return [...db.sessions].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
}

// Ranking anterior: el mismo cálculo sin la última sesión subida.
// No se guarda nada aparte: sale de las partidas de cada sesión.
export function previousRanking(db: DB): { last: Session | null; number: number; prev: PlayerStat[] } {
  const published = sortedSessions(db).filter((s) => s.published);
  const last = published.at(-1) ?? null;
  const ids = new Set(published.slice(0, -1).map((s) => s.id));
  return { last, number: published.length, prev: ranking(db, db.matches.filter((m) => ids.has(m.sessionId))) };
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
