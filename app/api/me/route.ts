import { connection } from "next/server";
import { getMe } from "@/lib/auth";

export async function GET() {
  await connection(); // siempre en tiempo de petición, nunca prerenderizado
  return Response.json(await getMe(), { headers: { "Cache-Control": "no-store" } });
}
