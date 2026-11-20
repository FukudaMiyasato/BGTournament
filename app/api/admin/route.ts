import { NextRequest } from "next/server";
import { getMe } from "@/lib/auth";
import { deletePhoto, loadDB, loadPhoto, saveDB, savePhoto } from "@/lib/store";
import { Backup, DB, DEFAULT_PHOTO_ID } from "@/lib/types";

const newId = () => crypto.randomUUID().replace(/-/g, "").slice(0, 10);
const clean = (v: unknown) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, 60) : "");
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

class Fail extends Error {}

function validPhoto(v: unknown): v is string {
  return (
    typeof v === "string" &&
    /^data:image\/(jpeg|png|webp);base64,/.test(v) &&
    v.length < 1_500_000
  );
}

type Body = Record<string, unknown>;

async function apply(db: DB, b: Body) {
  switch (b.action) {
    case "addPlayer": {
      const name = clean(b.name);
      if (!name) throw new Fail("Escribe un nombre");
      if (db.players.some((p) => same(p.name, name))) throw new Fail("Ya existe un jugador con ese nombre");
      const id = newId();
      let photoV = 0;
      if (validPhoto(b.photo)) {
        await savePhoto(id, b.photo);
        photoV = 1;
      }
      db.players.push({ id, name, photoV });
      return;
    }
    case "updatePlayer": {
      const p = db.players.find((x) => x.id === b.id);
      if (!p) throw new Fail("Jugador no encontrado");
      if (b.name !== undefined) {
        const name = clean(b.name);
        if (!name) throw new Fail("Escribe un nombre");
        if (db.players.some((x) => x.id !== p.id && same(x.name, name)))
          throw new Fail("Ya existe un jugador con ese nombre");
        p.name = name;
      }
      if (validPhoto(b.photo)) {
        await savePhoto(p.id, b.photo);
        p.photoV = Date.now();
      } else if (b.removePhoto) {
        await deletePhoto(p.id);
        p.photoV = 0;
      }
      return;
    }
    case "deletePlayer": {
      if (db.matches.some((m) => m.playerIds.includes(b.id as string)))
        throw new Fail("Este jugador tiene partidas registradas. Quítalo de esas partidas primero.");
      db.players = db.players.filter((p) => p.id !== b.id);
      await deletePhoto(String(b.id)).catch(() => {});
      return;
    }
    case "addGame": {
      const name = clean(b.name);
      if (!name) throw new Fail("Escribe el nombre del juego");
      if (db.games.some((g) => same(g.name, name))) throw new Fail("Ese juego ya existe");
      db.games.push({ id: newId(), name });
      return;
    }
    case "updateGame": {
      const g = db.games.find((x) => x.id === b.id);
      const name = clean(b.name);
      if (!g) throw new Fail("Juego no encontrado");
      if (!name) throw new Fail("Escribe el nombre del juego");
      if (db.games.some((x) => x.id !== g.id && same(x.name, name))) throw new Fail("Ese juego ya existe");
      g.name = name;
      return;
    }
    case "deleteGame": {
      if (db.matches.some((m) => m.gameId === b.id))
        throw new Fail("Este juego tiene partidas registradas. Bórralas o cámbialas de juego primero.");
      db.games = db.games.filter((g) => g.id !== b.id);
      return;
    }
    case "saveMatch": {
      const gameName = clean(b.gameName);
      if (!gameName) throw new Fail("Escribe el nombre del juego");
      const date = typeof b.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.date) ? b.date : "";
      if (!date) throw new Fail("Fecha inválida");
      const known = new Set(db.players.map((p) => p.id));
      const playerIds = [...new Set(Array.isArray(b.playerIds) ? b.playerIds : [])].filter(
        (x): x is string => typeof x === "string" && known.has(x)
      );
      const winnerIds = [...new Set(Array.isArray(b.winnerIds) ? b.winnerIds : [])].filter(
        (x): x is string => typeof x === "string" && playerIds.includes(x)
      );
      if (playerIds.length < 1) throw new Fail("Marca quiénes jugaron");
      // El juego se registra solo si es nuevo
      let game = db.games.find((g) => same(g.name, gameName));
      if (!game) {
        game = { id: newId(), name: gameName };
        db.games.push(game);
      }
      if (b.id) {
        const m = db.matches.find((x) => x.id === b.id);
        if (!m) throw new Fail("Partida no encontrada");
        Object.assign(m, { gameId: game.id, date, playerIds, winnerIds });
      } else {
        db.matches.push({ id: newId(), gameId: game.id, date, playerIds, winnerIds, createdAt: Date.now() });
      }
      return;
    }
    case "deleteMatch": {
      db.matches = db.matches.filter((m) => m.id !== b.id);
      return;
    }
    case "setDefaultPhoto": {
      if (!validPhoto(b.photo)) throw new Fail("Imagen inválida");
      await savePhoto(DEFAULT_PHOTO_ID, b.photo);
      db.defaultPhotoV = Date.now();
      return;
    }
    case "resetDefaultPhoto": {
      await deletePhoto(DEFAULT_PHOTO_ID);
      db.defaultPhotoV = 0;
      return;
    }
    case "import": {
      await importBackup(db, b.data as Partial<Backup>);
      return;
    }
    default:
      throw new Fail("Acción desconocida");
  }
}

// Fusiona una copia de seguridad: no borra nada; jugadores y juegos se emparejan por nombre.
async function importBackup(db: DB, data: Partial<Backup>) {
  if (!data || !Array.isArray(data.players) || !Array.isArray(data.games) || !Array.isArray(data.matches))
    throw new Fail("El archivo no es una copia válida de BG Tournament");
  const photos = data.photos ?? {};
  const playerMap = new Map<string, string>();
  for (const inc of data.players) {
    const name = clean(inc?.name);
    if (!name) continue;
    let p = db.players.find((x) => same(x.name, name));
    if (!p) {
      p = { id: newId(), name, photoV: 0 };
      db.players.push(p);
    }
    playerMap.set(inc.id, p.id);
    if (validPhoto(photos[inc.id])) {
      await savePhoto(p.id, photos[inc.id]);
      p.photoV = Date.now();
    }
  }
  const gameMap = new Map<string, string>();
  for (const inc of data.games) {
    const name = clean(inc?.name);
    if (!name) continue;
    let g = db.games.find((x) => same(x.name, name));
    if (!g) {
      g = { id: newId(), name };
      db.games.push(g);
    }
    gameMap.set(inc.id, g.id);
  }
  for (const m of data.matches) {
    const gameId = gameMap.get(m?.gameId);
    if (!gameId || db.matches.some((x) => x.id === m.id)) continue;
    if (typeof m.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(m.date)) continue;
    const ids = (list: unknown) =>
      (Array.isArray(list) ? list : []).map((x) => playerMap.get(x)).filter((x): x is string => !!x);
    const playerIds = ids(m.playerIds);
    if (!playerIds.length) continue;
    db.matches.push({
      id: typeof m.id === "string" && /^[a-z0-9]{6,20}$/.test(m.id) ? m.id : newId(),
      gameId,
      date: m.date,
      playerIds,
      winnerIds: ids(m.winnerIds).filter((x) => playerIds.includes(x)),
      createdAt: Number(m.createdAt) || Date.now(),
    });
  }
  if (validPhoto(photos[DEFAULT_PHOTO_ID])) {
    await savePhoto(DEFAULT_PHOTO_ID, photos[DEFAULT_PHOTO_ID]);
    db.defaultPhotoV = Date.now();
  }
}

// Exporta todo (datos + fotos) como archivo JSON
export async function GET() {
  if (!(await getMe()).isAdmin) return Response.json({ error: "No autorizado" }, { status: 401 });
  const db = await loadDB();
  const photos: Record<string, string> = {};
  const ids = db.players.filter((p) => p.photoV).map((p) => p.id);
  if (db.defaultPhotoV) ids.push(DEFAULT_PHOTO_ID);
  for (const id of ids) {
    const photo = await loadPhoto(id);
    if (photo) photos[id] = photo;
  }
  const backup: Backup = { ...db, photos };
  return new Response(JSON.stringify(backup), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="bgtournament-datos.json"`,
      "Cache-Control": "no-store",
    },
  });
}

export async function POST(req: NextRequest) {
  if (!(await getMe()).isAdmin) return Response.json({ error: "No autorizado" }, { status: 401 });
  try {
    const body = (await req.json()) as Body;
    const db = await loadDB();
    await apply(db, body);
    await saveDB(db);
    return Response.json(db);
  } catch (e) {
    const status = e instanceof Fail ? 400 : 500;
    return Response.json({ error: (e as Error).message }, { status });
  }
}
