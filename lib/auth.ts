import { auth } from "@/auth";

export type Me = {
  configured: boolean; // login con Google configurado (o modo local abierto)
  open: boolean; // modo local sin login
  email: string | null;
  isAdmin: boolean;
};

const googleReady = () =>
  !!process.env.AUTH_SECRET && !!process.env.AUTH_GOOGLE_ID && !!process.env.AUTH_GOOGLE_SECRET;

// Correos administradores: ADMIN_EMAILS="uno@gmail.com, otro@gmail.com"
const adminEmails = () =>
  (process.env.ADMIN_EMAILS ?? "")
    .split(/[,;\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

export async function getMe(): Promise<Me> {
  if (!googleReady()) {
    // Sin Google configurado: abierto en local, bloqueado en Vercel.
    const open = !process.env.VERCEL;
    return { configured: open, open, email: null, isAdmin: open };
  }
  const session = await auth();
  const email = session?.user?.email?.toLowerCase() ?? null;
  return { configured: true, open: false, email, isAdmin: !!email && adminEmails().includes(email) };
}
