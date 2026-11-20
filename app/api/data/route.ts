import { NextRequest, connection } from "next/server";
import { getMe } from "@/lib/auth";
import { loadDB } from "@/lib/store";

// Público: solo las sesiones ya subidas. Con ?all (y siendo admin): todo, incluidas las sesiones en preparación.
export async function GET(req: NextRequest) {
  await connection();
  try {
    const db = await loadDB();
    const all = req.nextUrl.searchParams.has("all") && (await getMe()).isAdmin;
    if (!all) {
      db.sessions = db.sessions.filter((s) => s.published);
      const visible = new Set(db.sessions.map((s) => s.id));
      db.matches = db.matches.filter((m) => visible.has(m.sessionId));
    }
    return Response.json(db, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
