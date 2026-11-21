"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { DB, Game, Player, STUDIOS, StudioId } from "@/lib/types";

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

// Íconos de cada studio (trazo blanco sobre el color del studio)
const STUDIO_ICONS: Record<StudioId, React.ReactNode> = {
  // Product: caja
  product: (
    <>
      <path d="M12 3 20 7.5v9L12 21l-8-4.5v-9L12 3Z" />
      <path d="M4 7.5 12 12l8-4.5M12 12v9" />
    </>
  ),
  // Movement: rayo
  movement: <path d="M13.5 2.5 5 13.5h6l-1 8 8.5-11h-6l1-8Z" />,
  // Understanding: lupa
  understanding: (
    <>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="m15 15 5.5 5.5" />
    </>
  ),
  // Operaciones: engranaje
  operaciones: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" />
      <circle cx="12" cy="12" r="6.5" />
    </>
  ),
  // Externo: globo
  externo: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.6 2.4 3.8 5.2 3.8 8.5s-1.2 6.1-3.8 8.5c-2.6-2.4-3.8-5.2-3.8-8.5s1.2-6.1 3.8-8.5Z" />
    </>
  ),
};

export function StudioIcon({ studio }: { studio: StudioId }) {
  return (
    <span className="studio-icon" style={{ background: STUDIOS[studio].color }} title={STUDIOS[studio].label}>
      <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label={STUDIOS[studio].label}>
        {STUDIO_ICONS[studio]}
      </svg>
    </span>
  );
}

// badge: muestra el ícono del studio abajo a la derecha de la foto
export function Avatar({ player, size = 48, badge = false }: { player: Player; size?: number; badge?: boolean }) {
  const defaultV = useContext(DefaultPhoto);
  const src = player.photoV
    ? `/api/photo/${player.id}?v=${player.photoV}`
    : defaultV
      ? `/api/photo/default?v=${defaultV}`
      : "/default-avatar.svg";
  return (
    <span className="avatar-wrap" style={{ width: size, height: size }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="avatar" src={src} alt={player.name} />
      {badge && player.studio && <StudioIcon studio={player.studio} />}
    </span>
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
