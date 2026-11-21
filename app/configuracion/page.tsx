"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { signIn, signOut } from "next-auth/react";
import { Avatar, DefaultPhoto, GameThumb, useDB } from "../ui";
import { formatDate, gameStats, playerStats, sortedSessions } from "@/lib/stats";
import { DB, Game, Player, STUDIOS, Session, StudioId } from "@/lib/types";
import type { Me } from "@/lib/auth";

type Act = (body: Record<string, unknown>) => Promise<boolean>;
const today = () => new Date().toLocaleDateString("sv"); // YYYY-MM-DD local
const newId = () => crypto.randomUUID().replace(/-/g, "").slice(0, 10);

// Recorta al centro y reduce a 400x400 para que la foto pese poco
async function fileToPhoto(file: File): Promise<string> {
  const img = await createImageBitmap(file);
  const side = Math.min(img.width, img.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 400;
  canvas
    .getContext("2d")!
    .drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, 400, 400);
  return canvas.toDataURL("image/jpeg", 0.85);
}

export default function Config() {
  const { db, setDB, error: loadError } = useDB(true);
  const [auth, setAuth] = useState<Me | null>(null);
  const [tab, setTab] = useState<"partidas" | "jugadores" | "juegos" | "listado" | "datos">("partidas");
  const [error, setError] = useState("");

  const checkAuth = () =>
    fetch("/api/me", { cache: "no-store" })
      .then((r) => r.json())
      .then(setAuth);
  useEffect(() => {
    checkAuth();
  }, []);

  // Los cambios se envían de uno en uno y en orden, para que los clics rápidos no se pisen
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const act: Act = (body) => {
    const run = async () => {
      setError("");
      try {
        const r = await fetch("/api/admin", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const j = await r.json();
        if (r.status === 401) await checkAuth();
        if (!r.ok) throw new Error(j.error || "Error");
        setDB(j);
        return true;
      } catch (e) {
        setError((e as Error).message);
        return false;
      }
    };
    const result = queue.current.then(run);
    queue.current = result;
    return result;
  };

  let content;
  if (loadError) content = <p className="notice error">{loadError}</p>;
  else if (!auth || !db) content = <p className="muted center">Cargando…</p>;
  else if (!auth.configured)
    content = (
      <p className="notice error">
        Falta configurar el login con Google en Vercel: define <code>AUTH_SECRET</code>,{" "}
        <code>AUTH_GOOGLE_ID</code>, <code>AUTH_GOOGLE_SECRET</code> y <code>ADMIN_EMAILS</code>.
      </p>
    );
  else if (!auth.email && !auth.open)
    content = (
      <div className="card form login center">
        <p className="muted">Solo los administradores pueden entrar a configuración.</p>
        <button className="btn" onClick={() => signIn("google", { callbackUrl: "/configuracion" })}>
          Entrar con Google
        </button>
      </div>
    );
  else if (!auth.isAdmin)
    content = (
      <div className="card form login center">
        <p>
          <strong>{auth.email}</strong> no es una cuenta administradora.
        </p>
        <button className="btn ghost" onClick={() => signOut({ callbackUrl: "/configuracion" })}>
          Cerrar sesión
        </button>
      </div>
    );
  else
    content = (
      <>
        <nav className="tabs">
          {(
            [
              ["partidas", "Sesiones"],
              ["jugadores", "Jugadores"],
              ["juegos", "Juegos"],
              ["listado", "Listado"],
              ["datos", "Ajustes"],
            ] as const
          ).map(([k, label]) => (
            <button key={k} className={tab === k ? "on" : ""} onClick={() => { setTab(k); setError(""); }}>
              {label}
            </button>
          ))}
        </nav>
        {error && <p className="notice error">{error}</p>}
        {tab === "partidas" && <Sessions db={db} act={act} goPlayers={() => setTab("jugadores")} />}
        {tab === "jugadores" && <Players db={db} act={act} />}
        {tab === "juegos" && <Games db={db} act={act} />}
        {tab === "listado" && <Listing db={db} />}
        {tab === "datos" && <Data db={db} act={act} />}
      </>
    );

  return (
    <DefaultPhoto value={db?.defaultPhotoV ?? 0}>
    <main className="page">
      <header className="top">
        <h1>⚙️ Configuración</h1>
        <div className="row">
          {auth?.email && auth.isAdmin && (
            <button className="btn ghost small" title={auth.email} onClick={() => signOut({ callbackUrl: "/" })}>
              Cerrar sesión
            </button>
          )}
          <Link href="/" className="btn ghost small">Ver ranking</Link>
        </div>
      </header>
      {content}
    </main>
    </DefaultPhoto>
  );
}

/* ---------- Sesiones ---------- */

function Chips({
  players, selected, onToggle,
}: { players: Player[]; selected: string[]; onToggle: (id: string) => void }) {
  return (
    <div className="chips">
      {players.map((p) => {
        const on = selected.includes(p.id);
        return (
          <button
            type="button"
            key={p.id}
            className={`chip ${on ? "on" : ""}`}
            aria-pressed={on}
            onClick={() => onToggle(p.id)}
          >
            <Avatar player={p} size={28} />
            {p.name}
          </button>
        );
      })}
    </div>
  );
}

function Sessions({ db, act, goPlayers }: { db: DB; act: Act; goPlayers: () => void }) {
  const [date, setDate] = useState(today());
  const sessions = sortedSessions(db);

  return (
    <>
      <form
        className="card form"
        onSubmit={async (e) => {
          e.preventDefault();
          await act({ action: "addSession", date });
        }}
      >
        <h2>Nueva sesión</h2>
        {db.players.length === 0 ? (
          <p className="muted">
            Primero agrega jugadores.{" "}
            <button type="button" className="link" onClick={goPlayers}>Ir a Jugadores</button>
          </p>
        ) : (
          <div className="row">
            <label>
              Fecha de la sesión
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </label>
            <button className="btn">＋ Agregar sesión</button>
          </div>
        )}
      </form>

      {sessions.length === 0 && (
        <p className="muted" style={{ marginTop: 24 }}>Aún no hay sesiones.</p>
      )}
      {sessions
        .map((session, i) => <SessionCard key={session.id} session={session} number={i + 1} db={db} act={act} />)
        .reverse()}
    </>
  );
}

// Una partida mientras se edita en su fila
type Row = { id: string; gameName: string; playerIds: string[]; places: string[] };

function SessionCard({ session, number, db, act }: { session: Session; number: number; db: DB; act: Act }) {
  // Filas con cambios aún no confirmados por el servidor (o nuevas sin completar): se muestran al instante
  const [local, setLocal] = useState<Record<string, Row>>({});
  const version = useRef<Record<string, number>>({});
  const gameById = new Map(db.games.map((g) => [g.id, g]));
  const saved: Row[] = db.matches
    .filter((m) => m.sessionId === session.id)
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((m) => ({ id: m.id, gameName: gameById.get(m.gameId)?.name ?? "", playerIds: m.playerIds, places: m.places }));
  const savedIds = new Set(saved.map((r) => r.id));
  const rows = [...saved.map((r) => local[r.id] ?? r), ...Object.values(local).filter((r) => !savedIds.has(r.id))];
  const players = [...db.players].sort((a, b) => a.name.localeCompare(b.name));
  const complete = (row: Row) => !!row.gameName && row.playerIds.length > 0;

  const forget = (id: string) =>
    setLocal((l) => Object.fromEntries(Object.entries(l).filter(([key]) => key !== id)));
  const change = async (row: Row) => {
    setLocal((l) => ({ ...l, [row.id]: row }));
    if (!complete(row)) return; // se guarda sola en cuanto tiene juego e integrantes
    const v = (version.current[row.id] = (version.current[row.id] ?? 0) + 1);
    const ok = await act({ action: "saveMatch", sessionId: session.id, ...row });
    // Solo el último cambio de la fila decide: confirmado → manda el servidor; fallido → se descarta si ya existía
    if (version.current[row.id] === v && (ok || savedIds.has(row.id))) forget(row.id);
  };
  const remove = (row: Row) => {
    if (!savedIds.has(row.id)) return forget(row.id);
    if (confirm(`¿Borrar la partida de ${row.gameName}?`)) {
      forget(row.id);
      act({ action: "deleteMatch", id: row.id });
    }
  };
  // La fila nueva hereda los integrantes de la anterior: en una sesión suelen repetirse
  const addRow = () => {
    const id = newId();
    setLocal((l) => ({ ...l, [id]: { id, gameName: "", playerIds: rows.at(-1)?.playerIds ?? [], places: [] } }));
  };

  return (
    <section className={`card session ${session.published ? "" : "draft"}`}>
      <header className="session-head">
        <strong>Sesión {number}</strong>
        <input
          type="date"
          className="inline"
          aria-label="Fecha de la sesión"
          value={session.date}
          onChange={(e) => e.target.value && act({ action: "updateSession", id: session.id, date: e.target.value })}
        />
        <span className={`badge ${session.published ? "ok" : ""}`}>
          {session.published ? "Subida" : "En preparación"}
        </span>
        <span className="grow" />
        {session.published ? (
          <button
            className="btn ghost small"
            onClick={() =>
              confirm(`¿Deshacer la subida de la sesión ${number}? Dejará de contar en el ranking público.`) &&
              act({ action: "updateSession", id: session.id, published: false })
            }
          >
            Deshacer subida
          </button>
        ) : (
          <button
            className="btn small"
            disabled={saved.length === 0}
            onClick={() =>
              confirm(`¿Subir la sesión ${number} (${formatDate(session.date)})? Sus puntos se sumarán al ranking público.`) &&
              act({ action: "updateSession", id: session.id, published: true })
            }
          >
            Subir sesión
          </button>
        )}
        <button
          className="btn danger small"
          onClick={() =>
            confirm(`¿Borrar la sesión ${number} y sus ${saved.length} partidas?`) &&
            act({ action: "deleteSession", id: session.id })
          }
        >
          Borrar
        </button>
      </header>

      {rows.map((row) => (
        <MatchRow
          key={row.id}
          row={row}
          incomplete={!complete(row)}
          players={players}
          games={db.games}
          onChange={change}
          onDelete={() => remove(row)}
        />
      ))}

      <div className="session-foot">
        <button className="btn ghost small" onClick={addRow}>＋ Agregar partida</button>
        {rows.length > 0 && (
          <span className="muted">
            Toca las caritas en orden: la primera es el 1.º, la siguiente el 2.º, y así. Toca
            de nuevo para quitar un puesto.
          </span>
        )}
      </div>
    </section>
  );
}

function MatchRow({
  row, incomplete, players, games, onChange, onDelete,
}: {
  row: Row; incomplete: boolean; players: Player[]; games: Game[];
  onChange: (row: Row) => void; onDelete: () => void;
}) {
  const [name, setName] = useState(row.gameName);
  const [base, setBase] = useState(row.gameName);
  const [picking, setPicking] = useState(row.playerIds.length === 0);
  if (base !== row.gameName) {
    // El servidor puede devolver el nombre ya existente del juego (p. ej. otra capitalización)
    setBase(row.gameName);
    setName(row.gameName);
  }

  const commitName = () => {
    const next = name.trim();
    if (next !== row.gameName) onChange({ ...row, gameName: next });
  };
  const togglePlayer = (id: string) =>
    onChange(
      row.playerIds.includes(id)
        ? { ...row, playerIds: row.playerIds.filter((x) => x !== id), places: row.places.filter((x) => x !== id) }
        : { ...row, playerIds: [...row.playerIds, id] }
    );
  // Clic en una carita: toma el siguiente puesto libre; si ya tenía puesto, lo suelta y los demás suben
  const togglePlace = (id: string) =>
    onChange({
      ...row,
      places: row.places.includes(id) ? row.places.filter((x) => x !== id) : [...row.places, id],
    });

  return (
    <div className="match-row">
      <input
        className="game-input"
        list="games"
        value={name}
        placeholder="Juego"
        aria-label="Juego"
        onChange={(e) => setName(e.target.value)}
        onBlur={commitName}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      />
      <datalist id="games">
        {games.map((g) => <option key={g.id} value={g.name} />)}
      </datalist>

      <div className="faces grow">
        {players.filter((p) => row.playerIds.includes(p.id)).map((p) => {
          const place = row.places.indexOf(p.id) + 1;
          return (
            <button
              key={p.id}
              type="button"
              className={`face ${place ? `placed p${Math.min(place, 4)}` : ""}`}
              title={place ? `${p.name}: ${place}.º puesto (clic para quitar)` : `${p.name}: clic para darle el siguiente puesto`}
              onClick={() => togglePlace(p.id)}
            >
              <Avatar player={p} size={44} />
              {place > 0 && <span className="place">{place}</span>}
              <span className="face-name">{p.name}</span>
            </button>
          );
        })}
        {row.playerIds.length === 0 && <span className="muted">Elige los integrantes →</span>}
      </div>

      <button
        type="button"
        className={`btn ghost small ${picking ? "active" : ""}`}
        aria-expanded={picking}
        onClick={() => setPicking(!picking)}
      >
        👥 Integrantes
      </button>
      <button type="button" className="btn danger small" aria-label="Borrar partida" onClick={onDelete}>✕</button>

      {picking && (
        <div className="picker">
          <Chips players={players} selected={row.playerIds} onToggle={togglePlayer} />
        </div>
      )}
      {incomplete && <small className="muted hint">Se guarda sola al tener juego e integrantes.</small>}
    </div>
  );
}

/* ---------- Jugadores ---------- */

function StudioSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select className="studio-select" aria-label="Studio" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Sin studio</option>
      {(Object.keys(STUDIOS) as StudioId[]).map((id) => (
        <option key={id} value={id}>{STUDIOS[id].label}</option>
      ))}
    </select>
  );
}

function Players({ db, act }: { db: DB; act: Act }) {
  const [name, setName] = useState("");
  const [studio, setStudio] = useState("");
  const [photo, setPhoto] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (await act({ action: "addPlayer", name, studio, photo: photo || undefined })) {
      setName("");
      setStudio("");
      setPhoto("");
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <>
      <form className="card form" onSubmit={add}>
        <h2>Nuevo jugador</h2>
        <div className="row">
          <label className="grow">
            Nombre
            <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} />
          </label>
          <label>
            Studio
            <StudioSelect value={studio} onChange={setStudio} />
          </label>
          <label>
            Foto (opcional)
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                setPhoto(f ? await fileToPhoto(f).catch(() => "") : "");
              }}
            />
          </label>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {photo && <img className="avatar" src={photo} alt="" style={{ width: 56, height: 56 }} />}
        </div>
        <div className="row"><button className="btn">Agregar jugador</button></div>
      </form>

      <DefaultPhotoCard db={db} act={act} />

      <h2>Jugadores ({db.players.length})</h2>
      <ul className="card list">
        {[...db.players].sort((a, b) => a.name.localeCompare(b.name)).map((p) => (
          <PlayerRow key={p.id} player={p} act={act} />
        ))}
        {db.players.length === 0 && <li className="muted">Aún no hay jugadores.</li>}
      </ul>
    </>
  );
}

function PlayerRow({ player, act }: { player: Player; act: Act }) {
  const [name, setName] = useState(player.name);
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <li>
      <Avatar player={player} size={52} badge />
      <input
        className="grow inline"
        value={name}
        aria-label="Nombre"
        onChange={(e) => setName(e.target.value)}
        onBlur={async () => {
          if (name.trim() === player.name) return;
          if (!(await act({ action: "updatePlayer", id: player.id, name }))) setName(player.name);
        }}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      />
      <StudioSelect
        value={player.studio ?? ""}
        onChange={(studio) => act({ action: "updatePlayer", id: player.id, studio })}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f) await act({ action: "updatePlayer", id: player.id, photo: await fileToPhoto(f) });
          e.target.value = "";
        }}
      />
      <button className="btn ghost small" onClick={() => fileRef.current?.click()}>
        {player.photoV ? "Cambiar foto" : "Subir foto"}
      </button>
      {player.photoV > 0 && (
        <button className="btn ghost small" onClick={() => act({ action: "updatePlayer", id: player.id, removePhoto: true })}>
          Quitar foto
        </button>
      )}
      <button
        className="btn danger small"
        onClick={() => confirm(`¿Borrar a ${player.name}?`) && act({ action: "deletePlayer", id: player.id })}
      >
        Borrar
      </button>
    </li>
  );
}

function DefaultPhotoCard({ db, act }: { db: DB; act: Act }) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div className="card default-photo">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="avatar"
        style={{ width: 52, height: 52 }}
        src={db.defaultPhotoV ? `/api/photo/default?v=${db.defaultPhotoV}` : "/default-avatar.svg"}
        alt="Foto por defecto"
      />
      <div className="grow">
        <strong>Foto por defecto</strong>
        <div className="muted">Se muestra en los jugadores que no tienen foto.</div>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f) await act({ action: "setDefaultPhoto", photo: await fileToPhoto(f) });
          e.target.value = "";
        }}
      />
      <button className="btn ghost small" onClick={() => fileRef.current?.click()}>Cambiar</button>
      {db.defaultPhotoV > 0 && (
        <button className="btn ghost small" onClick={() => act({ action: "resetDefaultPhoto" })}>
          Restaurar original
        </button>
      )}
    </div>
  );
}

/* ---------- Datos ---------- */

function PointsCard({ db, act }: { db: DB; act: Act }) {
  const [points, setPoints] = useState<string[]>(db.points.map(String));
  const [saved, setSaved] = useState(false);
  const set = (i: number, v: string) => {
    setPoints(points.map((p, j) => (j === i ? v : p)));
    setSaved(false);
  };
  return (
    <form
      className="card form"
      style={{ marginBottom: 16 }}
      onSubmit={async (e) => {
        e.preventDefault();
        setSaved(await act({ action: "setPoints", points: points.map((p) => Number(p || 0)) }));
      }}
    >
      <h2>Puntos por puesto</h2>
      <p className="muted">
        Puntos que suma cada puesto en una partida. Los puestos que no estén aquí suman 0. Al cambiarlos
        se recalcula todo el ranking.
      </p>
      <div className="row">
        {points.map((p, i) => (
          <label key={i} className="points-input">
            {i + 1}.º
            <input type="number" min={0} max={999} step={1} value={p} onChange={(e) => set(i, e.target.value)} required />
          </label>
        ))}
        <button type="button" className="btn ghost small" onClick={() => { setPoints([...points, "0"]); setSaved(false); }}>
          ＋ Puesto
        </button>
        {points.length > 1 && (
          <button type="button" className="btn ghost small" onClick={() => { setPoints(points.slice(0, -1)); setSaved(false); }}>
            − Quitar último
          </button>
        )}
      </div>
      <div className="row">
        <button className="btn">Guardar puntos</button>
        {saved && <span className="muted">Guardado.</span>}
      </div>
    </form>
  );
}

function Data({ db, act }: { db: DB; act: Act }) {
  const [msg, setMsg] = useState("");
  return (
    <>
      <PointsCard db={db} act={act} />
      <div className="card form">
        <h2>Exportar</h2>
        <p className="muted">Descarga una copia con jugadores, fotos, juegos y partidas.</p>
        <div className="row">
          <a className="btn" href="/api/admin" download>Descargar copia</a>
        </div>
      </div>
      <div className="card form" style={{ marginTop: 16 }}>
        <h2>Importar</h2>
        <p className="muted">
          Agrega lo que haya en una copia sin borrar nada: los jugadores y juegos con el mismo
          nombre se combinan y las partidas que ya existen no se duplican.
        </p>
        <div className="row">
          <input
            type="file"
            accept="application/json,.json"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              setMsg("");
              let data;
              try {
                data = JSON.parse(await f.text());
              } catch {
                data = null;
              }
              if (await act({ action: "import", data })) setMsg("Datos importados.");
            }}
          />
        </div>
        {msg && <p className="notice">{msg}</p>}
      </div>
    </>
  );
}

/* ---------- Juegos ---------- */

function Games({ db, act }: { db: DB; act: Act }) {
  const [name, setName] = useState("");
  const [photo, setPhoto] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const stats = gameStats(db);
  return (
    <>
      <form
        className="card form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await act({ action: "addGame", name, photo: photo || undefined })) {
            setName("");
            setPhoto("");
            if (fileRef.current) fileRef.current.value = "";
          }
        }}
      >
        <h2>Nuevo juego</h2>
        <div className="row">
          <label className="grow">
            Nombre
            <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} />
          </label>
          <label>
            Foto (opcional)
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                setPhoto(f ? await fileToPhoto(f).catch(() => "") : "");
              }}
            />
          </label>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {photo && <img className="game-thumb" src={photo} alt="" style={{ width: 56, height: 56 }} />}
        </div>
        <div className="row"><button className="btn">Agregar juego</button></div>
      </form>
      <h2>Juegos ({db.games.length})</h2>
      <ul className="card list">
        {stats.map((s) => (
          <GameRow key={s.game.id} game={s.game} played={s.played} act={act} />
        ))}
        {stats.length === 0 && <li className="muted">Aún no hay juegos.</li>}
      </ul>
    </>
  );
}

function GameRow({ game, played, act }: { game: Game; played: number; act: Act }) {
  const [name, setName] = useState(game.name);
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <li>
      <GameThumb game={game} size={52} />
      <input
        className="grow inline"
        value={name}
        aria-label="Nombre del juego"
        onChange={(e) => setName(e.target.value)}
        onBlur={async () => {
          if (name.trim() === game.name) return;
          if (!(await act({ action: "updateGame", id: game.id, name }))) setName(game.name);
        }}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      />
      <span className="muted">{played} {played === 1 ? "partida" : "partidas"}</span>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f) await act({ action: "updateGame", id: game.id, photo: await fileToPhoto(f) });
          e.target.value = "";
        }}
      />
      <button className="btn ghost small" onClick={() => fileRef.current?.click()}>
        {game.photoV ? "Cambiar foto" : "Subir foto"}
      </button>
      {!!game.photoV && (
        <button className="btn ghost small" onClick={() => act({ action: "updateGame", id: game.id, removePhoto: true })}>
          Quitar foto
        </button>
      )}
      <button
        className="btn danger small"
        onClick={() => confirm(`¿Borrar ${game.name}?`) && act({ action: "deleteGame", id: game.id })}
      >
        Borrar
      </button>
    </li>
  );
}

/* ---------- Listado ---------- */

const SORTS = {
  elo: "Mejor Elo",
  points: "Más puntos",
  played: "Más jugaron",
  losses: "Más perdieron",
  winRate: "Mejor %",
} as const;

function Listing({ db }: { db: DB }) {
  const [sort, setSort] = useState<keyof typeof SORTS>("elo");
  const rows = playerStats(db).sort(
    (a, b) => b[sort] - a[sort] || b.points - a.points || a.player.name.localeCompare(b.player.name)
  );
  const th = (k: keyof typeof SORTS, label: string) => (
    <th className={sort === k ? "num on" : "num"}>
      <button onClick={() => setSort(k)}>{label}{sort === k && " ↓"}</button>
    </th>
  );
  return (
    <>
      <div className="chips sort">
        {(Object.keys(SORTS) as (keyof typeof SORTS)[]).map((k) => (
          <button key={k} className={`chip ${sort === k ? "on" : ""}`} onClick={() => setSort(k)}>
            {SORTS[k]}
          </button>
        ))}
      </div>
      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Jugador</th>
              {th("elo", "Elo")}
              {th("played", "Jugadas")}
              {th("points", "Puntos")}
              <th className="num">1.º</th>
              <th className="num">2.º</th>
              <th className="num">3.º</th>
              {th("losses", "Perdidas")}
              {th("winRate", "% ganadas")}
            </tr>
          </thead>
          <tbody>
            {rows.map((s, i) => (
              <tr key={s.player.id}>
                <td className="muted">{i + 1}</td>
                <td><span className="who"><Avatar player={s.player} size={32} />{s.player.name}</span></td>
                <td className="num">{s.played ? Math.round(s.elo) : "—"}</td>
                <td className="num">{s.played}</td>
                <td className="num">{s.points}</td>
                <td className="num">{s.wins}</td>
                <td className="num">{s.seconds}</td>
                <td className="num">{s.thirds}</td>
                <td className="num">{s.losses}</td>
                <td className="num">{s.played ? `${Math.round(s.winRate * 100)}%` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="muted">Aún no hay jugadores.</p>}
      </div>
    </>
  );
}
