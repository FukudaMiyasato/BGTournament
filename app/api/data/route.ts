import { connection } from "next/server";
import { loadDB } from "@/lib/store";

export async function GET() {
  await connection();
  try {
    return Response.json(await loadDB(), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
