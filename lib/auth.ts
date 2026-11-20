import { createHmac, timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";

export const COOKIE = "bgt_admin";

// Sin ADMIN_PASSWORD: abierto en local, bloqueado en Vercel.
export function passwordRequired() {
  return !!process.env.ADMIN_PASSWORD || !!process.env.VERCEL;
}

export function tokenFor(password: string) {
  return createHmac("sha256", password).update("bgt-admin-session").digest("hex");
}

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function checkPassword(input: string) {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return false;
  return safeEqual(tokenFor(input), tokenFor(pw));
}

export function isAdmin(req: NextRequest) {
  if (!passwordRequired()) return true;
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) return false;
  const c = req.cookies.get(COOKIE)?.value;
  return !!c && safeEqual(c, tokenFor(pw));
}
