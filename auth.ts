import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

// Usa AUTH_SECRET, AUTH_GOOGLE_ID y AUTH_GOOGLE_SECRET
export const { handlers, auth } = NextAuth({
  providers: [Google],
  trustHost: true,
});
