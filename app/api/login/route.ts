import { NextRequest, NextResponse } from "next/server";
import { COOKIE, checkPassword, isAdmin, passwordRequired, tokenFor } from "@/lib/auth";

export async function GET(req: NextRequest) {
  return Response.json({
    authed: isAdmin(req),
    configured: !passwordRequired() || !!process.env.ADMIN_PASSWORD,
  });
}

export async function POST(req: NextRequest) {
  const { password } = await req.json().catch(() => ({}));
  if (typeof password !== "string" || !checkPassword(password)) {
    return Response.json({ error: "Contraseña incorrecta" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, tokenFor(password), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 90,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(COOKIE);
  return res;
}
