import { NextRequest, connection } from "next/server";
import { getMe } from "@/lib/auth";
import { loadDB } from "@/lib/store";

// Público: solo las temporadas ya subidas. Con ?all (y siendo admin): todo, incluida la temporada en preparación.
export async function GET(req: NextRequest) {
  await connection();
  try {
    const db = await loadDB();
    const all = req.nextUrl.searchParams.has("all") && (await getMe()).isAdmin;
    if (!all) db.matches = db.matches.filter((m) => m.season <= db.publishedSeason);
    return Response.json(db, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
