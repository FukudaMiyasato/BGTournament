"use client";

import { useEffect, useState } from "react";
import { DB, Player } from "@/lib/types";

export function useDB() {
  const [db, setDB] = useState<DB | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch("/api/data", { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Error al cargar");
        setDB(j);
      })
      .catch((e: Error) => setError(e.message));
  }, []);
  return { db, setDB, error };
}

const HUES = [12, 38, 95, 150, 185, 215, 260, 300, 335];

export function Avatar({ player, size = 48 }: { player: Player; size?: number }) {
  const style = { width: size, height: size, fontSize: size * 0.4 };
  if (player.photoV) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        className="avatar"
        style={style}
        src={`/api/photo/${player.id}?v=${player.photoV}`}
        alt={player.name}
      />
    );
  }
  const hash = [...player.id].reduce((a, c) => a + c.charCodeAt(0), 0);
  const initials = player.name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  return (
    <span
      className="avatar avatar-empty"
      style={{ ...style, background: `hsl(${HUES[hash % HUES.length]} 45% 38%)` }}
      aria-label={player.name}
    >
      {initials}
    </span>
  );
}
