import { DB, Game, Match, Player } from "./types";

export type PlayerStat = {
  player: Player;
  played: number;
  points: number; // 1 punto por partida ganada
  losses: number;
  winRate: number; // 0..1
  rank: number;
};
export type GameStat = { game: Game; played: number; topWinner: Player | null; topWins: number };

export function playerStats(db: DB, matches: Match[] = db.matches): PlayerStat[] {
  const map = new Map(
    db.players.map((p) => [p.id, { player: p, played: 0, points: 0, losses: 0, winRate: 0, rank: 0 }])
  );
  for (const m of matches) {
    for (const id of m.playerIds) {
      const s = map.get(id);
      if (!s) continue;
      s.played++;
      if (m.winnerIds.includes(id)) s.points++;
      else s.losses++;
    }
  }
  const list = [...map.values()];
  for (const s of list) s.winRate = s.played ? s.points / s.played : 0;
  list.sort(
    (a, b) =>
      b.points - a.points || b.winRate - a.winRate || a.player.name.localeCompare(b.player.name)
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

// Ranking anterior: el mismo cálculo sin la última temporada subida.
// No se guarda nada aparte: sale de la temporada de cada partida.
export function previousRanking(db: DB): PlayerStat[] {
  return ranking(db, db.matches.filter((m) => m.season < db.publishedSeason));
}

export function gameStats(db: DB): GameStat[] {
  const players = new Map(db.players.map((p) => [p.id, p]));
  return db.games
    .map((game) => {
      const ms = db.matches.filter((m) => m.gameId === game.id);
      const wins = new Map<string, number>();
      for (const m of ms) for (const w of m.winnerIds) wins.set(w, (wins.get(w) ?? 0) + 1);
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

export function sortedMatches(db: DB): Match[] {
  return [...db.matches].sort(
    (a, b) => b.season - a.season || b.createdAt - a.createdAt
  );
}
