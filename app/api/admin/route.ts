import { NextRequest } from "next/server";
import { getMe } from "@/lib/auth";
import { deletePhoto, loadDB, saveDB, savePhoto } from "@/lib/store";
import { DB } from "@/lib/types";

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
    default:
      throw new Fail("Acción desconocida");
  }
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
