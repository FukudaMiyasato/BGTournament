"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { DB, Game, Player } from "@/lib/types";

// all = incluir la temporada en preparación (solo administradores)
export function useDB(all = false) {
  const [db, setDB] = useState<DB | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch(all ? "/api/data?all" : "/api/data", { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Error al cargar");
        setDB(j);
      })
      .catch((e: Error) => setError(e.message));
  }, [all]);
  return { db, setDB, error };
}

// Versión de la foto por defecto personalizada (0 = la original)
export const DefaultPhoto = createContext(0);

export function Avatar({ player, size = 48 }: { player: Player; size?: number }) {
  const defaultV = useContext(DefaultPhoto);
  const src = player.photoV
    ? `/api/photo/${player.id}?v=${player.photoV}`
    : defaultV
      ? `/api/photo/default?v=${defaultV}`
      : "/default-avatar.svg";
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="avatar" style={{ width: size, height: size }} src={src} alt={player.name} />
  );
}

export function GameThumb({ game, size = 48 }: { game: Game; size?: number }) {
  const style = { width: size, height: size, fontSize: size * 0.5 };
  if (!game.photoV) return <span className="game-thumb" style={style} aria-hidden>🎲</span>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="game-thumb" style={style} src={`/api/photo/${game.id}?v=${game.photoV}`} alt={game.name} />
  );
}
