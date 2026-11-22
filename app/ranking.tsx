"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Avatar, StudioPill } from "./ui";
import { ELO, MODES, Mode, Ranked, formatDate, previousRanking, ranking } from "@/lib/stats";
import { DB, STUDIOS, StudioId } from "@/lib/types";

const TOP = 10; // espacios que siempre ocupa el ranking
const HOLD_MS = 1100; // tiempo mostrando el ranking anterior antes de animar

function Change({ now, prev }: { now: Ranked; prev: Ranked | undefined }) {
  if (now.provisional) return <span className="change same">Provisional</span>;
  if (!prev || prev.provisional) return <span className="change new">Nuevo</span>;
  const d = prev.rank - now.rank;
  if (d > 0) return <span className="change up">▲ {d}</span>;
  if (d < 0) return <span className="change down">▼ {-d}</span>;
  return <span className="change same">=</span>;
}

// Número del podio dentro de una corona de laurel
const LEAVES = [28, 64, 100, 136]; // grados desde abajo, subiendo por cada lado
function Laurel({ n }: { n: number }) {
  return (
    <span className="pos laurel">
      <svg viewBox="0 0 48 48" aria-hidden="true">
        {[1, -1].map((side) =>
          LEAVES.map((deg) => {
            const a = (deg * Math.PI) / 180;
            const x = Math.round((24 - side * 17 * Math.sin(a)) * 10) / 10;
            const y = Math.round((25 + 17 * Math.cos(a)) * 10) / 10;
            return <ellipse key={`${side}${deg}`} cx={x} cy={y} rx="2.7" ry="5.6" transform={`rotate(${side * (deg - 66)} ${x} ${y})`} />;
          })
        )}
      </svg>
      <b>{n}</b>
    </span>
  );
}

export function Ranking({ db }: { db: DB }) {
  const [view, setView] = useState<"now" | "prev">("now");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<Mode>("elo");
  const [all, setAll] = useState(false); // ver todos los puestos, no solo los 10 primeros
  const box = useRef<HTMLDivElement>(null);
  const before = useRef<Map<string, DOMRect> | null>(null);

  const now = ranking(db, mode);
  const { last, number, prev } = previousRanking(db, mode);
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

  const shown = all ? rows : rows.slice(0, TOP);
  const free = Math.max(0, TOP - shown.length); // espacios aún sin jugador
  const hasProvisional = rows.some((s) => s.provisional);
  const studiosInUse = (Object.keys(STUDIOS) as StudioId[]).filter((id) => rows.some((s) => s.player.studio === id));

  return (
    <div ref={box}>
      <div className="rank-bar">
        <span className="pill session-pill">
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>
          {now.length === 0 ? (
            <span>Aún no hay sesiones subidas</span>
          ) : view === "prev" ? (
            <span>{number > 1 ? `Antes de la sesión ${number}…` : "Antes de la primera sesión…"}</span>
          ) : (
            <span><strong>Sesión {number}</strong> · {last && formatDate(last.date)}</span>
          )}
        </span>
        <label className="pill mode">
          <span className="sr-only">Ordenar ranking por</span>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 9 4.5-9 4.5-9-4.5L12 3Z" /><path d="m3 12 9 4.5 9-4.5M3 16.5 12 21l9-4.5" /></svg>
          <select value={mode} onChange={(e) => setMode(e.target.value as Mode)} disabled={busy}>
            {(Object.keys(MODES) as Mode[]).map((m) => (
              <option key={m} value={m}>Ranking: {MODES[m]}</option>
            ))}
          </select>
        </label>
        {now.length > 0 && (
          <button className="pill animate" onClick={animate} disabled={busy}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l12-7.5-12-7.5Z" fill="currentColor" /></svg>
            Animar
          </button>
        )}
      </div>

      <ol className="ranking">
        {shown.map((s) => (
          <li key={s.player.id} data-flip={s.player.id} className={s.rank <= 3 ? `podio podio-${s.rank}` : ""}>
            {s.rank <= 3 ? <Laurel n={s.rank} /> : <span className="pos">{s.rank}</span>}
            <Avatar player={s.player} size={64} badge />
            <span className="name">
              {s.player.name}
              <small>{s.played} {s.played === 1 ? "partida" : "partidas"}</small>
            </span>
            <span className="tags">
              {s.player.studio && <StudioPill studio={s.player.studio} />}
              {showChange && <Change now={s} prev={prevById.get(s.player.id)} />}
            </span>
            <span className="points">{s.text}<small> {s.unit}</small></span>
          </li>
        ))}
        {Array.from({ length: free }, (_, i) => (
          <li key={`free${i}`} className="free" aria-hidden="true">
            <span className="pos">{shown.length + i + 1}</span>
            <span className="free-photo" />
            <span className="free-name" />
          </li>
        ))}
      </ol>
      {rows.length > TOP && (
        <div className="center">
          <button className="quiet" onClick={() => setAll(!all)} disabled={busy}>
            {all ? `Ver solo los ${TOP} primeros` : `Ver todos (${rows.length})`}
          </button>
        </div>
      )}
      {studiosInUse.length > 0 && (
        <div className="legend">
          {studiosInUse.map((id) => <StudioPill key={id} studio={id} solid />)}
        </div>
      )}
      {hasProvisional && (
        <p className="muted rank-note">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.5" /></svg>
          Provisional: con menos de {ELO.minGames} partidas se queda debajo de los clasificados.
        </p>
      )}
    </div>
  );
}
