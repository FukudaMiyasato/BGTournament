"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Avatar, DefaultPhoto, GameThumb, StudioIcon, useDB } from "./ui";
import { STUDIOS } from "@/lib/types";
import { formatDate, gameStats, playerStats, sortedMatches, studioWins } from "@/lib/stats";
import { Ranking } from "./ranking";

export default function Home() {
  const { db, error } = useDB();
  const [admin, setAdmin] = useState(false);
  useEffect(() => {
    fetch("/api/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((me) => setAdmin(!!me.isAdmin))
      .catch(() => {});
  }, []);

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
  const studios = studioWins(db);
  const maxStudio = Math.max(1, ...studios.map((x) => x.wins));

  return (
    <DefaultPhoto value={db.defaultPhotoV}>
    <main className="page">
      <header className="logo-head">
        <h1 className="sr-only">Boardgame Ranking</h1>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.webp" alt="Boardgame Ranking" width={1217} height={1293} />
      </header>

      {stats.length === 0 ? (
        <div className="card center empty">
          <p>Todavía no hay participantes.</p>
          <Link href="/configuracion" className="btn">Agregar jugadores</Link>
        </div>
      ) : (
        <Ranking db={db} admin={admin} />
      )}

      {matches.length > 0 && (
        <>
          <h2>Studios</h2>
          <section className="card studio-chart" aria-label="Partidas ganadas por studio">
            {studios.map(({ studio, wins }) => (
              <div key={studio} className="studio-bar" style={{ "--c": STUDIOS[studio].color } as React.CSSProperties}>
                <strong>{wins}</strong>
                <div className="track"><i style={{ height: `${(wins / maxStudio) * 100}%` }} /></div>
                <StudioIcon studio={studio} />
                <span>{STUDIOS[studio].label}</span>
              </div>
            ))}
          </section>
          <p className="muted chart-note">Partidas ganadas por los jugadores de cada studio.</p>

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
