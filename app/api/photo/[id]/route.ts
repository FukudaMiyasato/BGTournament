import { loadPhoto } from "@/lib/store";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dataUrl = await loadPhoto(id).catch(() => null);
  const m = dataUrl?.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if (!m) return new Response("Not found", { status: 404 });
  // La URL lleva ?v=N, que cambia cuando se reemplaza la foto.
  return new Response(Buffer.from(m[2], "base64"), {
    headers: { "Content-Type": m[1], "Cache-Control": "public, max-age=31536000, immutable" },
  });
}
