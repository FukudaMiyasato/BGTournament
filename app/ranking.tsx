"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Avatar } from "./ui";
import { PlayerStat, formatDate, previousRanking, ranking } from "@/lib/stats";
import { DB } from "@/lib/types";

const pts = (n: number) => `${n} ${n === 1 ? "punto" : "puntos"}`;
const HOLD_MS = 1100; // tiempo mostrando el ranking anterior antes de animar

function Change({ now, prev }: { now: PlayerStat; prev: PlayerStat | undefined }) {
  if (!prev) return <span className="change new">Nuevo</span>;
  const d = prev.rank - now.rank;
  if (d > 0) return <span className="change up">▲ {d}</span>;
  if (d < 0) return <span className="change down">▼ {-d}</span>;
  return <span className="change same">=</span>;
}

export function Ranking({ db }: { db: DB }) {
  const [view, setView] = useState<"now" | "prev">("now");
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const before = useRef<Map<string, DOMRect> | null>(null);

  const now = ranking(db);
  const { lastDay, prev } = previousRanking(db);
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
        <p>Aún no hay partidas registradas. El ranking aparecerá con la primera.</p>
      </div>
    );

  const podium = rows.length >= 3 && rows[0].points > 0 ? rows.slice(0, 3) : [];
  const rest = podium.length ? rows.slice(3) : rows;

  return (
    <div ref={box}>
      <div className="rank-bar">
        <span className="muted">
          {view === "prev"
            ? "Ranking anterior…"
            : showChange && lastDay
              ? `Cambios tras las partidas del ${formatDate(lastDay)}`
              : ""}
        </span>
        <button className="btn small" onClick={animate} disabled={busy}>▶ Animar</button>
      </div>

      {rows.length === 0 && <p className="card center muted empty">Sin ranking anterior</p>}

      {podium.length > 0 && (
        <section className="podium">
          {[podium[1], podium[0], podium[2]].map((s) => (
            <div
              key={s.player.id}
              data-flip={s.player.id}
              className={`podium-spot place-${rows.indexOf(s) + 1} rank-${s.rank}`}
            >
              <div className="podium-photo">
                <Avatar player={s.player} size={rows.indexOf(s) === 0 ? 132 : 100} />
                <span className="medal">{s.rank}</span>
              </div>
              <strong>{s.player.name}</strong>
              <span className="points">{pts(s.points)}</span>
              {showChange && <Change now={s} prev={prevById.get(s.player.id)} />}
            </div>
          ))}
        </section>
      )}

      {rest.length > 0 && (
        <ol className="card ranking">
          {rest.map((s) => (
            <li key={s.player.id} data-flip={s.player.id}>
              <span className="pos">{s.rank}</span>
              <Avatar player={s.player} size={52} />
              <span className="name">
                {s.player.name}
                <small>{s.played} {s.played === 1 ? "partida" : "partidas"}</small>
              </span>
              {showChange && <Change now={s} prev={prevById.get(s.player.id)} />}
              <span className="points">{s.points}<small> pts</small></span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
