"use client";

import { useContext, useLayoutEffect, useRef, useState } from "react";
import { Avatar, DefaultPhoto, StudioPill } from "./ui";
import { ExportModal } from "./export";
import Link from "next/link";
import { ELO, MODES, MVP_DAYS, Mode, Ranked, formatDate, mvps, previousRanking, ranking } from "@/lib/stats";
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

// admin: muestra arriba a la derecha los botones de animar y configuración
export function Ranking({ db, admin }: { db: DB; admin: boolean }) {
  const [view, setView] = useState<"now" | "prev">("now");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<Mode>("elo");
  const [exporting, setExporting] = useState(false); // modal del video
  const defaultV = useContext(DefaultPhoto);
  const [all, setAll] = useState(false); // ver todos los puestos, no solo los 10 primeros
  const box = useRef<HTMLDivElement>(null);
  const before = useRef<Map<string, DOMRect> | null>(null);

  const now = ranking(db, mode);
  const { last, number, prev } = previousRanking(db, mode);
  const mvp = mvps(db);
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
    <div ref={box} className="rank-col">
      {admin && (
        <div className="admin-tools">
          {now.length > 0 && (
            <button onClick={() => setExporting(true)} disabled={busy} title="Video del ranking" aria-label="Video del ranking">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="2.5" y="6" width="13" height="12" rx="2.5" />
                <path d="m15.5 10.5 6-3.5v10l-6-3.5" />
              </svg>
            </button>
          )}
          <Link href="/configuracion" title="Configuración" aria-label="Configuración">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" />
              <circle cx="12" cy="12" r="6.5" />
            </svg>
          </Link>
        </div>
      )}
      {exporting && (
        <ExportModal
          now={now}
          prev={prev}
          mode={mode}
          mvp={mvp}
          defaultV={defaultV}
          fileBase={`ranking-${last?.date ?? "sesion"}`}
          onClose={() => setExporting(false)}
          onAnimate={animate}
        />
      )}
      <div className="rank-bar">
        <span className="last-session">
          {now.length === 0 ? (
            "Aún no hay sesiones subidas"
          ) : view === "prev" ? (
            number > 1 ? `Antes de la sesión ${number}…` : "Antes de la primera sesión…"
          ) : (
            <>Última sesión: <strong>{last && formatDate(last.date)}</strong></>
          )}
        </span>
        <label className="pill mode">
          <span className="sr-only">Tipo de ranking</span>
          <select value={mode} onChange={(e) => setMode(e.target.value as Mode)} disabled={busy}>
            {(Object.keys(MODES) as Mode[]).map((m) => (
              <option key={m} value={m}>{MODES[m]}</option>
            ))}
          </select>
        </label>
      </div>

      <ol className="ranking">
        {shown.map((s) => (
          <li key={s.player.id} data-flip={s.player.id} className={s.rank <= 3 ? `podio podio-${s.rank}` : ""}>
            {s.rank <= 3 ? <Laurel n={s.rank} /> : <span className="pos">{s.rank}</span>}
            <Avatar player={s.player} size={56} />
            <span className="name">
              <span className="who">
                {s.player.name}
                {mvp.has(s.player.id) && (
                  <em className="mvp" title={`Quien más ganó de su studio en los últimos ${MVP_DAYS} días`}>MVP</em>
                )}
              </span>
              {s.player.studio && <StudioPill studio={s.player.studio} />}
            </span>
            <span className="tags">
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
