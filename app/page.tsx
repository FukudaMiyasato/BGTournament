"use client";

import Link from "next/link";
import { Avatar, DefaultPhoto, GameThumb, useDB } from "./ui";
import { formatDate, gameStats, playerStats, sortedMatches } from "@/lib/stats";
import { Ranking } from "./ranking";

export default function Home() {
  const { db, error } = useDB();

  if (error) return <main className="page"><p className="notice error">{error}</p></main>;
  if (!db) return <main className="page"><p className="muted center">Cargando…</p></main>;

  const stats = playerStats(db);
  const games = gameStats(db).filter((g) => g.played > 0);
  const matches = sortedMatches(db);
  const playerById = new Map(db.players.map((p) => [p.id, p]));
  const gameById = new Map(db.games.map((g) => [g.id, g]));
  const sessionById = new Map(db.sessions.map((x) => [x.id, x]));

  const active = stats.filter((s) => s.played > 0);
  const mostPlayed = [...active].sort((a, b) => b.played - a.played)[0];
  const mostLosses = [...active].sort((a, b) => b.losses - a.losses)[0];
  const bestRate = [...active]
    .filter((s) => s.played >= 3)
    .sort((a, b) => b.winRate - a.winRate || b.played - a.played)[0];
  const maxGame = games[0]?.played ?? 1;

  return (
    <DefaultPhoto value={db.defaultPhotoV}>
    <main className="page">
      <header className="top">
        <h1 className="brand">
          <svg viewBox="0 0 48 48" aria-hidden="true">
            <path className="cup" d="M15 7h18v9a9 9 0 0 1-18 0V7Z" />
            <path className="handle" d="M15 10H9v3a6 6 0 0 0 6 6M33 10h6v3a6 6 0 0 1-6 6" />
            <path className="cup" d="M22 24h4v7h-4zM16 31h16v5H16z" />
            <path className="step" d="M4 44 14 37h4l-10 7H4Z" />
            <path className="cup" d="M13 37h22v4H13z" />
            <path className="star" d="m24 9.5 1.4 2.9 3.1.4-2.3 2.2.6 3.1-2.8-1.5-2.8 1.5.6-3.1-2.3-2.2 3.1-.4L24 9.5Z" />
          </svg>
          <span><b>BG</b> TOURNAMENT</span>
        </h1>
        <Link href="/configuracion" className="pill config-link">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" />
            <circle cx="12" cy="12" r="6.5" />
          </svg>
          Configuración
        </Link>
      </header>

      {stats.length === 0 ? (
        <div className="card center empty">
          <p>Todavía no hay participantes.</p>
          <Link href="/configuracion" className="btn">Agregar jugadores</Link>
        </div>
      ) : (
        <Ranking db={db} />
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
                <span className="muted">{mostPlayed.played} {mostPlayed.played === 1 ? "partida" : "partidas"}</span>
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
                      <span className="muted">{formatDate(sessionById.get(m.sessionId)?.date ?? "")}</span>
                    </div>
                    <small className="muted">
                      🏆 {playerById.get(m.places[0])?.name ?? "Sin ganador"}
                      {m.places[1] && playerById.get(m.places[1]) && ` · 2.º ${playerById.get(m.places[1])!.name}`}
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
      <footer className="foot">
        <Link href="/doc">¿Cómo se calcula el ranking?</Link>
      </footer>
    </main>
    </DefaultPhoto>
  );
}
