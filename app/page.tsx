"use client";

import Link from "next/link";
import { Avatar, DefaultPhoto, GameThumb, useDB } from "./ui";
import { formatDate, gameStats, playerStats, sortedMatches } from "@/lib/stats";

const pts = (n: number) => `${n} ${n === 1 ? "punto" : "puntos"}`;

export default function Home() {
  const { db, error } = useDB();

  if (error) return <main className="page"><p className="notice error">{error}</p></main>;
  if (!db) return <main className="page"><p className="muted center">Cargando…</p></main>;

  const stats = playerStats(db);
  const games = gameStats(db).filter((g) => g.played > 0);
  const matches = sortedMatches(db);
  const playerById = new Map(db.players.map((p) => [p.id, p]));
  const gameById = new Map(db.games.map((g) => [g.id, g]));

  const active = stats.filter((s) => s.played > 0);
  const mostPlayed = [...active].sort((a, b) => b.played - a.played)[0];
  const mostLosses = [...active].sort((a, b) => b.losses - a.losses)[0];
  const bestRate = [...active]
    .filter((s) => s.played >= 3)
    .sort((a, b) => b.winRate - a.winRate || b.played - a.played)[0];
  const podium = stats.length >= 3 && stats[0].points > 0 ? stats.slice(0, 3) : [];
  const rest = podium.length ? stats.slice(3) : stats;
  const maxGame = games[0]?.played ?? 1;

  return (
    <DefaultPhoto value={db.defaultPhotoV}>
    <main className="page">
      <header className="top">
        <h1>🎲 BG Tournament</h1>
        <Link href="/configuracion" className="btn ghost small">Configuración</Link>
      </header>

      {stats.length === 0 ? (
        <div className="card center empty">
          <p>Todavía no hay participantes.</p>
          <Link href="/configuracion" className="btn">Agregar jugadores</Link>
        </div>
      ) : (
        <>
          {podium.length > 0 && (
            <section className="podium">
              {[podium[1], podium[0], podium[2]].map((s) => (
                <div key={s.player.id} className={`podium-spot place-${stats.indexOf(s) + 1} rank-${s.rank}`}>
                  <div className="podium-photo">
                    <Avatar player={s.player} size={stats.indexOf(s) === 0 ? 132 : 100} />
                    <span className="medal">{s.rank}</span>
                  </div>
                  <strong>{s.player.name}</strong>
                  <span className="points">{pts(s.points)}</span>
                </div>
              ))}
            </section>
          )}

          {rest.length > 0 && (
            <ol className="card ranking">
              {rest.map((s) => (
                <li key={s.player.id}>
                  <span className="pos">{s.rank}</span>
                  <Avatar player={s.player} size={52} />
                  <span className="name">
                    {s.player.name}
                    <small>{s.played} {s.played === 1 ? "partida" : "partidas"}</small>
                  </span>
                  <span className="points">{s.points}<small> pts</small></span>
                </li>
              ))}
            </ol>
          )}
        </>
      )}

      {matches.length > 0 && (
        <>
          <h2>Estadísticas</h2>
          <section className="tiles">
            <div className="card tile">
              <span className="label">Partidas jugadas</span>
              <strong>{matches.length}</strong>
              <span className="muted">{games.length} {games.length === 1 ? "juego distinto" : "juegos distintos"}</span>
            </div>
            {games[0] && (
              <div className="card tile">
                <span className="label">Juego más jugado</span>
                <strong className="who"><GameThumb game={games[0].game} size={32} />{games[0].game.name}</strong>
                <span className="muted">{games[0].played} {games[0].played === 1 ? "vez" : "veces"}</span>
              </div>
            )}
            {mostPlayed && (
              <div className="card tile">
                <span className="label">Quien más jugó</span>
                <strong className="who"><Avatar player={mostPlayed.player} size={32} />{mostPlayed.player.name}</strong>
                <span className="muted">{mostPlayed.played} partidas</span>
              </div>
            )}
            {mostLosses && mostLosses.losses > 0 && (
              <div className="card tile">
                <span className="label">Quien más perdió</span>
                <strong className="who"><Avatar player={mostLosses.player} size={32} />{mostLosses.player.name}</strong>
                <span className="muted">{mostLosses.losses} {mostLosses.losses === 1 ? "derrota" : "derrotas"}</span>
              </div>
            )}
            {bestRate && (
              <div className="card tile">
                <span className="label">Mejor efectividad</span>
                <strong className="who"><Avatar player={bestRate.player} size={32} />{bestRate.player.name}</strong>
                <span className="muted">{Math.round(bestRate.winRate * 100)}% ganadas (mín. 3 partidas)</span>
              </div>
            )}
          </section>

          <div className="two-col">
            <section>
              <h2>Juegos</h2>
              <ul className="card bars">
                {games.map((g) => (
                  <li key={g.game.id} className="with-thumb">
                    <GameThumb game={g.game} size={44} />
                    <div className="grow">
                      <div className="bar-head">
                        <span>{g.game.name}</span>
                        <span className="muted">{g.played}</span>
                      </div>
                      <div className="bar"><i style={{ width: `${(g.played / maxGame) * 100}%` }} /></div>
                      {g.topWinner && (
                        <small className="muted">Más ganador: {g.topWinner.name} ({g.topWins})</small>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
            <section>
              <h2>Últimas partidas</h2>
              <ul className="card recent">
                {matches.slice(0, 8).map((m) => (
                  <li key={m.id} className="with-thumb">
                    {gameById.get(m.gameId) && <GameThumb game={gameById.get(m.gameId)!} size={44} />}
                    <div className="grow">
                    <div className="bar-head">
                      <span>{gameById.get(m.gameId)?.name ?? "—"}</span>
                      <span className="muted">{formatDate(m.date)}</span>
                    </div>
                    <small className="muted">
                      🏆 {m.winnerIds.map((id) => playerById.get(id)?.name).filter(Boolean).join(", ") || "Sin ganador"}
                      {" · "}{m.playerIds.length} jugadores
                    </small>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </>
      )}
    </main>
    </DefaultPhoto>
  );
}
