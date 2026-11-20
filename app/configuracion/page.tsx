"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { Avatar, useDB } from "../ui";
import { formatDate, gameStats, playerStats, sortedMatches } from "@/lib/stats";
import { DB, Match, Player } from "@/lib/types";

type Act = (body: Record<string, unknown>) => Promise<boolean>;
const today = () => new Date().toLocaleDateString("sv"); // YYYY-MM-DD local

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
  const { db, setDB, error: loadError } = useDB();
  const [auth, setAuth] = useState<{ authed: boolean; configured: boolean } | null>(null);
  const [tab, setTab] = useState<"partidas" | "jugadores" | "juegos" | "listado">("partidas");
  const [error, setError] = useState("");

  const checkAuth = () =>
    fetch("/api/login")
      .then((r) => r.json())
      .then(setAuth);
  useEffect(() => {
    checkAuth();
  }, []);

  const act: Act = async (body) => {
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

  let content;
  if (loadError) content = <p className="notice error">{loadError}</p>;
  else if (!auth || !db) content = <p className="muted center">Cargando…</p>;
  else if (!auth.configured)
    content = (
      <p className="notice error">
        Falta definir la variable de entorno <code>ADMIN_PASSWORD</code> en Vercel para poder
        entrar a configuración.
      </p>
    );
  else if (!auth.authed) content = <Login onDone={checkAuth} />;
  else
    content = (
      <>
        <nav className="tabs">
          {(
            [
              ["partidas", "Partidas"],
              ["jugadores", "Jugadores"],
              ["juegos", "Juegos"],
              ["listado", "Listado"],
            ] as const
          ).map(([k, label]) => (
            <button key={k} className={tab === k ? "on" : ""} onClick={() => { setTab(k); setError(""); }}>
              {label}
            </button>
          ))}
        </nav>
        {error && <p className="notice error">{error}</p>}
        {tab === "partidas" && <Matches db={db} act={act} goPlayers={() => setTab("jugadores")} />}
        {tab === "jugadores" && <Players db={db} act={act} />}
        {tab === "juegos" && <Games db={db} act={act} />}
        {tab === "listado" && <Listing db={db} />}
      </>
    );

  return (
    <main className="page">
      <header className="top">
        <h1>⚙️ Configuración</h1>
        <Link href="/" className="btn ghost small">Ver ranking</Link>
      </header>
      {content}
    </main>
  );
}

function Login({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const r = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (r.ok) onDone();
    else setError("Contraseña incorrecta");
  };
  return (
    <form className="card form login" onSubmit={submit}>
      <label>
        Contraseña
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
      </label>
      {error && <p className="notice error">{error}</p>}
      <button className="btn">Entrar</button>
    </form>
  );
}

/* ---------- Partidas ---------- */

function Chips({
  players, selected, onToggle, trophy,
}: { players: Player[]; selected: string[]; onToggle: (id: string) => void; trophy?: boolean }) {
  return (
    <div className="chips">
      {players.map((p) => {
        const on = selected.includes(p.id);
        return (
          <button
            type="button"
            key={p.id}
            className={`chip ${on ? (trophy ? "on win" : "on") : ""}`}
            aria-pressed={on}
            onClick={() => onToggle(p.id)}
          >
            <Avatar player={p} size={28} />
            {p.name}
            {trophy && on && " 🏆"}
          </button>
        );
      })}
    </div>
  );
}

function Matches({ db, act, goPlayers }: { db: DB; act: Act; goPlayers: () => void }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [gameName, setGameName] = useState("");
  const [date, setDate] = useState(today());
  const [playerIds, setPlayerIds] = useState<string[]>([]);
  const [winnerIds, setWinnerIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  const players = [...db.players].sort((a, b) => a.name.localeCompare(b.name));
  const playerById = new Map(db.players.map((p) => [p.id, p]));
  const gameById = new Map(db.games.map((g) => [g.id, g]));

  const reset = () => {
    setEditing(null);
    setGameName("");
    setDate(today());
    setPlayerIds([]);
    setWinnerIds([]);
  };
  const edit = (m: Match) => {
    setEditing(m.id);
    setGameName(gameById.get(m.gameId)?.name ?? "");
    setDate(m.date);
    setPlayerIds(m.playerIds);
    setWinnerIds(m.winnerIds);
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const togglePlayer = (id: string) => {
    if (playerIds.includes(id)) {
      setPlayerIds(playerIds.filter((x) => x !== id));
      setWinnerIds(winnerIds.filter((x) => x !== id));
    } else setPlayerIds([...playerIds, id]);
  };
  const toggleWinner = (id: string) =>
    setWinnerIds(winnerIds.includes(id) ? winnerIds.filter((x) => x !== id) : [...winnerIds, id]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const ok = await act({ action: "saveMatch", id: editing, gameName, date, playerIds, winnerIds });
    setBusy(false);
    if (ok) reset();
  };

  return (
    <>
      <form className="card form" onSubmit={submit} ref={formRef}>
        <h2>{editing ? "Editar partida" : "Nueva partida"}</h2>
        {players.length === 0 ? (
          <p className="muted">
            Primero agrega jugadores.{" "}
            <button type="button" className="link" onClick={goPlayers}>Ir a Jugadores</button>
          </p>
        ) : (
          <>
            <div className="row">
              <label className="grow">
                Juego
                <input
                  list="games"
                  value={gameName}
                  onChange={(e) => setGameName(e.target.value)}
                  placeholder="Ej. Catan (si es nuevo, se registra solo)"
                  required
                />
                <datalist id="games">
                  {db.games.map((g) => <option key={g.id} value={g.name} />)}
                </datalist>
              </label>
              <label>
                Fecha
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
              </label>
            </div>
            <div className="field">
              <span>¿Quiénes jugaron? <em>({playerIds.length})</em></span>
              <Chips players={players} selected={playerIds} onToggle={togglePlayer} />
            </div>
            {playerIds.length > 0 && (
              <div className="field">
                <span>¿Quiénes ganaron? <em>(1 punto cada uno)</em></span>
                <Chips
                  players={players.filter((p) => playerIds.includes(p.id))}
                  selected={winnerIds}
                  onToggle={toggleWinner}
                  trophy
                />
              </div>
            )}
            <div className="row">
              <button className="btn" disabled={busy || playerIds.length === 0}>
                {editing ? "Guardar cambios" : "Registrar partida"}
              </button>
              {editing && <button type="button" className="btn ghost" onClick={reset}>Cancelar</button>}
            </div>
          </>
        )}
      </form>

      <h2>Partidas jugadas ({db.matches.length})</h2>
      {db.matches.length === 0 ? (
        <p className="muted">Aún no hay partidas registradas.</p>
      ) : (
        <ul className="card list">
          {sortedMatches(db).map((m) => (
            <li key={m.id} className={editing === m.id ? "editing" : ""}>
              <div className="grow">
                <strong>{gameById.get(m.gameId)?.name ?? "—"}</strong>{" "}
                <span className="muted">· {formatDate(m.date)}</span>
                <div className="mini-players">
                  {m.playerIds.map((id) => {
                    const p = playerById.get(id);
                    if (!p) return null;
                    const won = m.winnerIds.includes(id);
                    return (
                      <span key={id} className={won ? "won" : ""}>
                        {won && "🏆 "}{p.name}
                      </span>
                    );
                  })}
                </div>
              </div>
              <button className="btn ghost small" onClick={() => edit(m)}>Editar</button>
              <button
                className="btn danger small"
                onClick={() => confirm("¿Borrar esta partida?") && act({ action: "deleteMatch", id: m.id })}
              >
                Borrar
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/* ---------- Jugadores ---------- */

function Players({ db, act }: { db: DB; act: Act }) {
  const [name, setName] = useState("");
  const [photo, setPhoto] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (await act({ action: "addPlayer", name, photo: photo || undefined })) {
      setName("");
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
      <Avatar player={player} size={52} />
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

/* ---------- Juegos ---------- */

function Games({ db, act }: { db: DB; act: Act }) {
  const [name, setName] = useState("");
  const stats = gameStats(db);
  return (
    <>
      <form
        className="card form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await act({ action: "addGame", name })) setName("");
        }}
      >
        <h2>Nuevo juego</h2>
        <div className="row">
          <label className="grow">
            Nombre
            <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} />
          </label>
          <button className="btn">Agregar juego</button>
        </div>
      </form>
      <h2>Juegos ({db.games.length})</h2>
      <ul className="card list">
        {stats.map((s) => (
          <GameRow key={s.game.id} id={s.game.id} name={s.game.name} played={s.played} act={act} />
        ))}
        {stats.length === 0 && <li className="muted">Aún no hay juegos.</li>}
      </ul>
    </>
  );
}

function GameRow({ id, name: initial, played, act }: { id: string; name: string; played: number; act: Act }) {
  const [name, setName] = useState(initial);
  return (
    <li>
      <input
        className="grow inline"
        value={name}
        aria-label="Nombre del juego"
        onChange={(e) => setName(e.target.value)}
        onBlur={async () => {
          if (name.trim() === initial) return;
          if (!(await act({ action: "updateGame", id, name }))) setName(initial);
        }}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      />
      <span className="muted">{played} {played === 1 ? "partida" : "partidas"}</span>
      <button
        className="btn danger small"
        onClick={() => confirm(`¿Borrar ${initial}?`) && act({ action: "deleteGame", id })}
      >
        Borrar
      </button>
    </li>
  );
}

/* ---------- Listado ---------- */

const SORTS = {
  points: "Más puntos",
  played: "Más jugaron",
  losses: "Más perdieron",
  winRate: "Mejor %",
} as const;

function Listing({ db }: { db: DB }) {
  const [sort, setSort] = useState<keyof typeof SORTS>("points");
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
              {th("played", "Jugadas")}
              {th("points", "Puntos")}
              {th("losses", "Perdidas")}
              {th("winRate", "% ganadas")}
            </tr>
          </thead>
          <tbody>
            {rows.map((s, i) => (
              <tr key={s.player.id}>
                <td className="muted">{i + 1}</td>
                <td><span className="who"><Avatar player={s.player} size={32} />{s.player.name}</span></td>
                <td className="num">{s.played}</td>
                <td className="num">{s.points}</td>
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
