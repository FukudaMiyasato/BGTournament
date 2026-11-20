"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { signIn, signOut } from "next-auth/react";
import { Avatar, DefaultPhoto, GameThumb, useDB } from "../ui";
import { formatDate, gameStats, playerStats, sortedMatches } from "@/lib/stats";
import { DB, Game, Match, Player } from "@/lib/types";
import type { Me } from "@/lib/auth";

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
              ["partidas", "Partidas"],
              ["jugadores", "Jugadores"],
              ["juegos", "Juegos"],
              ["listado", "Listado"],
              ["datos", "Datos"],
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
        {tab === "datos" && <Data act={act} />}
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

function Data({ act }: { act: Act }) {
  const [msg, setMsg] = useState("");
  return (
    <>
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
