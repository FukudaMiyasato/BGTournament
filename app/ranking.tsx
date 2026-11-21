"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Avatar, StudioIcon } from "./ui";
import { ELO, MODES, Mode, Ranked, formatDate, previousRanking, ranking } from "@/lib/stats";
import { DB, STUDIOS, StudioId } from "@/lib/types";

const HOLD_MS = 1100; // tiempo mostrando el ranking anterior antes de animar

function Change({ now, prev }: { now: Ranked; prev: Ranked | undefined }) {
  if (now.provisional) return <span className="change same">Provisional</span>;
  if (!prev || prev.provisional) return <span className="change new">Nuevo</span>;
  const d = prev.rank - now.rank;
  if (d > 0) return <span className="change up">▲ {d}</span>;
  if (d < 0) return <span className="change down">▼ {-d}</span>;
  return <span className="change same">=</span>;
}

export function Ranking({ db }: { db: DB }) {
  const [view, setView] = useState<"now" | "prev">("now");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<Mode>("elo");
  const box = useRef<HTMLDivElement>(null);
  const before = useRef<Map<string, DOMRect> | null>(null);

  const now = ranking(db, mode);
  const { last, number, prev } = previousRanking(db, mode);
  const title = last ? `Sesión ${number} · ${formatDate(last.date)}` : "";
  const prevById = new Map(prev.map((s) => [s.player.id, s]));
  const rows = view === "now" ? now : prev;
  const showChange = view === "now" && prev.length > 0;

  const items = () => [...(box.current?.querySelectorAll<HTMLElement>("[data-flip]") ?? [])];

  const animate = () => {
    if (busy) return;
    setBusy(true);
    setView("prev");
    setTimeout(() => {
      before.current = new Map(items().map((el) => [el.dataset.flip!, el.getBoundingClientRect()]));
      setView("now");
    }, HOLD_MS);
  };

  // FLIP: cada jugador parte de donde estaba en el ranking anterior y se desliza a su nuevo puesto
  useLayoutEffect(() => {
    const old = before.current;
    if (view !== "now" || !old) return;
    before.current = null;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const duration = reduce ? 0 : 1200;
    let entering = 0;
    for (const el of items()) {
      const from = old.get(el.dataset.flip!);
      const to = el.getBoundingClientRect();
      if (!from) {
        // Jugador nuevo: aparece al final, uno tras otro
        el.animate(
          [{ opacity: 0, transform: "scale(0.6)" }, { opacity: 1, transform: "none" }],
          { duration: reduce ? 0 : 600, delay: reduce ? 0 : duration * 0.7 + entering++ * 150, fill: "backwards", easing: "cubic-bezier(.2,1.4,.4,1)" }
        );
        continue;
      }
      const dx = from.left + from.width / 2 - (to.left + to.width / 2);
      const dy = from.top + from.height / 2 - (to.top + to.height / 2);
      if (!dx && !dy) continue;
      el.style.zIndex = dy > 0 ? "2" : "1"; // quien sube pasa por encima
      el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], {
        duration,
        easing: "cubic-bezier(.3,.7,.2,1)",
      }).onfinish = () => (el.style.zIndex = "");
    }
    const t = setTimeout(() => setBusy(false), duration + 600);
    return () => clearTimeout(t);
  }, [view]);

  if (now.length === 0)
    return (
      <div className="card center empty">
        <p>Aún no hay sesiones subidas. El ranking aparecerá con la primera.</p>
      </div>
    );

  const classified = rows.filter((s) => !s.provisional);
  const podium = classified.length >= 3 ? classified.slice(0, 3) : [];
  const rest = podium.length ? rows.slice(3) : rows;
  const hasProvisional = rows.some((s) => s.provisional);
  const studiosInUse = (Object.keys(STUDIOS) as StudioId[]).filter((id) => rows.some((s) => s.player.studio === id));

  return (
    <div ref={box}>
      <div className="rank-bar">
        <span className="muted">
          {view === "prev"
            ? number > 1 ? `Así estaba antes de la sesión ${number}…` : "Antes de la primera sesión…"
            : showChange
              ? `${title} · cambios respecto a la sesión anterior`
              : title}
        </span>
        <label className="mode">
          <span className="sr-only">Ordenar ranking por</span>
          <select value={mode} onChange={(e) => setMode(e.target.value as Mode)} disabled={busy}>
            {(Object.keys(MODES) as Mode[]).map((m) => (
              <option key={m} value={m}>{MODES[m]}</option>
            ))}
          </select>
        </label>
        <button className="btn small" onClick={animate} disabled={busy}>▶ Animar</button>
      </div>

      {rows.length === 0 && <p className="card center muted empty">Todavía sin ranking</p>}

      {podium.length > 0 && (
        <section className="podium">
          {[podium[1], podium[0], podium[2]].map((s) => (
            <div
              key={s.player.id}
              data-flip={s.player.id}
              className={`podium-spot place-${rows.indexOf(s) + 1} rank-${s.rank}`}
            >
              <div className="podium-photo">
                <Avatar player={s.player} size={rows.indexOf(s) === 0 ? 132 : 100} badge />
                <span className="medal">{s.rank}</span>
              </div>
              <strong>{s.player.name}</strong>
              <span className="points">{s.text} {s.unit}</span>
              {showChange && <Change now={s} prev={prevById.get(s.player.id)} />}
            </div>
          ))}
        </section>
      )}

      {rest.length > 0 && (
        <ol className="card ranking">
          {rest.map((s) => (
            <li key={s.player.id} data-flip={s.player.id}>
              <span className="pos">{s.provisional ? "–" : s.rank}</span>
              <Avatar player={s.player} size={52} badge />
              <span className="name">
                {s.player.name}
                <small>{s.played} {s.played === 1 ? "partida" : "partidas"}</small>
              </span>
              {showChange && <Change now={s} prev={prevById.get(s.player.id)} />}
              <span className="points">{s.text}<small> {s.unit}</small></span>
            </li>
          ))}
        </ol>
      )}
      {studiosInUse.length > 0 && (
        <div className="legend">
          {studiosInUse.map((id) => (
            <span key={id}><StudioIcon studio={id} />{STUDIOS[id].label}</span>
          ))}
        </div>
      )}
      {hasProvisional && (
        <p className="muted rank-note">
          Provisional: con menos de {ELO.minGames} partidas todavía no se entra en la clasificación.
        </p>
      )}
    </div>
  );
}
