"use client";

import { useEffect, useRef, useState } from "react";
import { Mode, Ranked } from "@/lib/stats";
import { STUDIOS } from "@/lib/types";

// Video del ranking: solo el cuadro, para ponerlo encima de otro video en un editor.
// Se dibuja en un canvas cuadro por cuadro y se codifica como MP4 (H.264) en el navegador.

const FPS = 30;
const W = 1080;
const PAD = 28;
const ROW = 128;
const HOLD = 1.0; // segundos mostrando el ranking anterior
const MOVE = 1.4; // deslizamiento al nuevo puesto
const ENTER = 0.5; // aparición de los jugadores nuevos
const END = 2.4; // ranking final quieto
const TOTAL = HOLD + MOVE + ENTER + END;

const CARD = "#0d122c";
const TEXT = "#eef0f6";
const MUTED = "#98a0b8";
const MEDALS = ["#f5b942", "#c3c9d6", "#d08a5b"];

type Row = {
  id: string;
  name: string;
  sub: string;
  studio: string;
  studioColor: string;
  mvp: boolean;
  img: HTMLImageElement | null;
  fromSlot: number | null; // null = no estaba en el ranking anterior
  toSlot: number;
  fromRank: number;
  toRank: number;
  fromScore: number;
  toScore: number;
  unit: string;
};

export type ExportInput = {
  now: Ranked[];
  prev: Ranked[];
  mode: Mode;
  mvp: Set<string>;
  defaultV: number;
  from: number; // puestos a incluir (según el ranking actual)
  to: number;
};

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const clamp = (t: number) => Math.min(1, Math.max(0, t));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function buildRows(input: ExportInput): Promise<Row[]> {
  const chosen = input.now.filter((s) => s.rank >= input.from && s.rank <= input.to);
  const prevById = new Map(input.prev.map((s) => [s.player.id, s]));
  // Antes: los mismos jugadores, en el orden que tenían entre ellos
  const before = chosen
    .filter((s) => prevById.has(s.player.id))
    .sort((a, b) => prevById.get(a.player.id)!.rank - prevById.get(b.player.id)!.rank);
  const fallback = input.defaultV ? `/api/photo/default?v=${input.defaultV}` : "/default-avatar.svg";
  return Promise.all(
    chosen.map(async (s, toSlot) => {
      const old = prevById.get(s.player.id);
      const fromSlot = before.indexOf(s);
      const studio = s.player.studio ? STUDIOS[s.player.studio] : null;
      const src = s.player.photoV ? `/api/photo/${s.player.id}?v=${s.player.photoV}` : fallback;
      return {
        id: s.player.id,
        name: s.player.name,
        sub: `${s.played} ${s.played === 1 ? "partida" : "partidas"}`,
        studio: studio?.label ?? "",
        studioColor: studio?.color ?? MUTED,
        mvp: input.mvp.has(s.player.id),
        img: (await loadImage(src)) ?? (await loadImage("/default-avatar.svg")),
        fromSlot: fromSlot >= 0 ? fromSlot : null,
        toSlot,
        fromRank: old?.rank ?? s.rank,
        toRank: s.rank,
        fromScore: old?.score ?? s.score,
        toScore: s.score,
        unit: s.unit,
      };
    })
  );
}

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
}

function draw(c: CanvasRenderingContext2D, rows: Row[], t: number, font: string, percent: boolean) {
  const H = c.canvas.height;
  const moving = ease(clamp((t - HOLD) / MOVE));
  const entering = (i: number) => clamp((t - HOLD - MOVE - i * 0.08) / ENTER);
  const ended = clamp((t - HOLD - MOVE - ENTER) / 0.4);
  const slotY = (slot: number) => PAD + slot * ROW;
  const set = (weight: number, size: number) => (c.font = `${weight} ${size}px ${font}`);

  c.fillStyle = CARD;
  c.fillRect(0, 0, W, H);
  // Líneas entre puestos
  c.fillStyle = "rgba(120, 135, 200, 0.18)";
  for (let i = 1; i < rows.length; i++) c.fillRect(PAD + 24, slotY(i) - 1, W - 2 * PAD - 48, 2);

  const firstSlot = rows.findIndex((r) => r.toRank === 1);
  let fresh = 0;
  const placed = rows.map((r) => {
    const isNew = r.fromSlot === null;
    return {
      r,
      y: isNew ? slotY(r.toSlot) : lerp(slotY(r.fromSlot!), slotY(r.toSlot), moving),
      alpha: isNew ? ease(entering(fresh++)) : 1,
      rising: !isNew && r.toSlot < r.fromSlot!,
    };
  });
  // Quien sube se dibuja encima
  placed.sort((a, b) => Number(a.rising) - Number(b.rising));

  for (const { r, y, alpha } of placed) {
    if (alpha <= 0) continue;
    c.save();
    c.globalAlpha = alpha;
    const isNew = r.fromSlot === null;
    const mid = y + ROW / 2;
    const rank = Math.round(lerp(isNew ? r.toRank : r.fromRank, r.toRank, moving));
    const medal = MEDALS[rank - 1];

    // Fondo de la fila (tapa a las que pasan por debajo) y dorado cuando está en el primer puesto
    roundRect(c, PAD, y + 4, W - 2 * PAD, ROW - 8, 22);
    c.fillStyle = CARD;
    c.fill();
    const gold = firstSlot >= 0 ? clamp(1 - Math.abs(y - slotY(firstSlot)) / ROW) : 0;
    if (gold > 0) {
      const g = c.createLinearGradient(PAD, 0, W - PAD, 0);
      g.addColorStop(0, "#4a3a16");
      g.addColorStop(0.45, "#2a2540");
      g.addColorStop(1, "#6b5420");
      c.globalAlpha = alpha * gold;
      c.fillStyle = g;
      c.fill();
      c.strokeStyle = "rgba(245, 185, 66, 0.75)";
      c.lineWidth = 2;
      c.stroke();
      c.globalAlpha = alpha;
    }

    // Puesto
    const px = PAD + 62;
    c.textAlign = "center";
    c.textBaseline = "middle";
    set(800, 38);
    if (medal) {
      c.beginPath();
      c.arc(px, mid, 34, 0, Math.PI * 2);
      c.strokeStyle = medal;
      c.lineWidth = 5;
      c.setLineDash([14, 7]);
      c.stroke();
      c.setLineDash([]);
      c.fillStyle = "#fff";
    } else {
      roundRect(c, px - 32, mid - 32, 64, 64, 16);
      c.fillStyle = "rgba(120, 135, 200, 0.14)";
      c.fill();
      c.fillStyle = MUTED;
    }
    c.fillText(String(rank), px, mid + 2);

    // Foto
    const ax = PAD + 172;
    const ar = 46;
    c.save();
    c.beginPath();
    c.arc(ax, mid, ar, 0, Math.PI * 2);
    c.fillStyle = "#1b2145";
    c.fill();
    c.clip();
    if (r.img) {
      const iw = r.img.naturalWidth || 400;
      const ih = r.img.naturalHeight || 400;
      const side = Math.min(iw, ih);
      c.drawImage(r.img, (iw - side) / 2, (ih - side) / 2, side, side, ax - ar, mid - ar, ar * 2, ar * 2);
    }
    c.restore();
    c.beginPath();
    c.arc(ax, mid, ar + 2, 0, Math.PI * 2);
    c.strokeStyle = medal ?? "rgba(120, 135, 200, 0.4)";
    c.lineWidth = 4;
    c.stroke();

    // Nombre, MVP y studio
    const tx = PAD + 244;
    c.textAlign = "left";
    set(700, 40);
    c.fillStyle = TEXT;
    c.fillText(r.name, tx, mid - 18);
    if (r.mvp) {
      const nx = tx + c.measureText(r.name).width + 14;
      set(800, 20);
      const mw = c.measureText("MVP").width + 22;
      roundRect(c, nx, mid - 33, mw, 30, 8);
      c.fillStyle = MEDALS[0];
      c.fill();
      c.fillStyle = "#1a1300";
      c.fillText("MVP", nx + 11, mid - 17);
    }
    set(400, 26);
    let sx = tx;
    if (r.studio) {
      c.beginPath();
      c.arc(sx + 9, mid + 28, 9, 0, Math.PI * 2);
      c.fillStyle = r.studioColor;
      c.fill();
      sx += 28;
    }
    c.fillStyle = MUTED;
    c.fillText(r.studio ? `${r.studio} · ${r.sub}` : r.sub, sx, mid + 29);

    // Puntaje
    const score = Math.round(lerp(r.fromScore, r.toScore, moving));
    c.textAlign = "right";
    set(400, 26);
    c.fillStyle = MUTED;
    const right = W - PAD - 30;
    c.fillText(r.unit, right, mid + 8);
    const unitW = c.measureText(r.unit).width;
    set(800, 54);
    c.fillStyle = TEXT;
    const scoreText = percent ? `${score}%` : String(score);
    c.fillText(scoreText, right - unitW - 12, mid + 2);

    // Cambio de puesto, al terminar
    const d = isNew ? 0 : r.fromRank - r.toRank;
    const label = isNew ? "NUEVO" : d > 0 ? `▲ ${d}` : d < 0 ? `▼ ${-d}` : "";
    if (label && ended > 0) {
      const bx = right - unitW - 12 - c.measureText(scoreText).width - 26;
      set(700, 24);
      const bw = c.measureText(label).width + 28;
      c.globalAlpha = alpha * ended;
      roundRect(c, bx - bw, mid - 20, bw, 40, 20);
      c.fillStyle = "#1b2145";
      c.fill();
      c.fillStyle = isNew ? MEDALS[0] : d > 0 ? "#5fd38d" : "#ef6b6b";
      c.textAlign = "center";
      c.fillText(label, bx - bw / 2, mid + 1);
    }
    c.restore();
  }
}

async function renderVideo(input: ExportInput, onProgress: (p: number) => void): Promise<Blob> {
  if (typeof VideoEncoder === "undefined")
    throw new Error("Este navegador no puede exportar video. Prueba con Chrome, Edge o Safari actualizados.");
  const rows = await buildRows(input);
  if (!rows.length) throw new Error("No hay jugadores en esas posiciones.");

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = PAD * 2 + ROW * rows.length; // siempre par
  const c = canvas.getContext("2d")!;
  const font = getComputedStyle(document.body).fontFamily;
  await Promise.all([400, 700, 800].map((w) => document.fonts.load(`${w} 40px ${font}`).catch(() => null)));

  // H.264: nivel 4.0 hasta ~2 millones de píxeles; más alto para rankings largos
  const big = canvas.width * canvas.height > 2_000_000;
  const codecs = big ? ["avc1.640033", "avc1.4d0033"] : ["avc1.640028", "avc1.4d0028", "avc1.42002a"];
  let config: VideoEncoderConfig | null = null;
  for (const codec of codecs) {
    const candidate = { codec, width: canvas.width, height: canvas.height, bitrate: 8_000_000, framerate: FPS };
    if ((await VideoEncoder.isConfigSupported(candidate)).supported) {
      config = candidate;
      break;
    }
  }
  if (!config) throw new Error("Este navegador no puede codificar el video en MP4 (H.264).");

  const { Muxer, ArrayBufferTarget } = await import("mp4-muxer");
  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: "avc", width: canvas.width, height: canvas.height, frameRate: FPS },
    fastStart: "in-memory",
  });
  let failed: Error | null = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => (failed = e),
  });
  encoder.configure(config);

  const frames = Math.round(TOTAL * FPS);
  const percent = input.mode === "rate";
  for (let i = 0; i < frames; i++) {
    if (failed) throw failed;
    draw(c, rows, i / FPS, font, percent);
    const frame = new VideoFrame(canvas, { timestamp: (i * 1e6) / FPS, duration: 1e6 / FPS });
    encoder.encode(frame, { keyFrame: i % FPS === 0 });
    frame.close();
    if (encoder.encodeQueueSize > 4) await new Promise((r) => setTimeout(r, 10));
    if (i % 10 === 0) {
      onProgress(i / frames);
      await new Promise((r) => setTimeout(r, 0)); // deja pintar el progreso
    }
  }
  await encoder.flush();
  if (failed) throw failed;
  muxer.finalize();
  return new Blob([muxer.target.buffer], { type: "video/mp4" });
}

type Props = Omit<ExportInput, "from" | "to"> & {
  fileName: string;
  onClose: () => void;
  onAnimate: () => void; // animación en la propia página
};

export function ExportModal({ fileName, onClose, onAnimate, ...data }: Props) {
  const total = data.now.length;
  const [scope, setScope] = useState<"all" | "range">("all");
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(Math.min(10, total));
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [video, setVideo] = useState<{ url: string; file: File } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  useEffect(() => () => void (video && URL.revokeObjectURL(video.url)), [video]);

  const range = scope === "all" ? { from: 1, to: total } : { from: Math.min(from, to), to: Math.max(from, to) };
  const busy = progress !== null;

  const run = async () => {
    setError("");
    setVideo(null);
    setProgress(0);
    try {
      const blob = await renderVideo({ ...data, ...range }, setProgress);
      const file = new File([blob], fileName, { type: "video/mp4" });
      setVideo({ url: URL.createObjectURL(blob), file });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear el video");
    }
    setProgress(null);
  };

  const canShare = !!video && typeof navigator.canShare === "function" && navigator.canShare({ files: [video.file] });
  const num = (value: number, set: (n: number) => void, label: string) => (
    <input
      type="number"
      min={1}
      max={total}
      value={value}
      aria-label={label}
      disabled={busy || scope !== "range"}
      onChange={(e) => set(Math.min(total, Math.max(1, Number(e.target.value) || 1)))}
    />
  );

  return (
    <dialog ref={dialog} className="modal" onClose={onClose} onCancel={(e) => busy && e.preventDefault()}>
      <h2>Video del ranking</h2>
      <p className="muted">
        Crea un MP4 solo con el cuadro del ranking pasando de la sesión anterior a la actual, para ponerlo encima de
        otro video.
      </p>
      <label className="choice">
        <input type="radio" name="scope" checked={scope === "all"} disabled={busy} onChange={() => setScope("all")} />
        Ranking completo ({total} {total === 1 ? "puesto" : "puestos"})
      </label>
      <label className="choice">
        <input type="radio" name="scope" checked={scope === "range"} disabled={busy} onChange={() => setScope("range")} />
        Solo las posiciones del {num(from, setFrom, "Desde el puesto")} al {num(to, setTo, "Hasta el puesto")}
      </label>

      {error && <p className="notice error">{error}</p>}
      {busy && (
        <div className="bar" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
          <i style={{ width: `${progress * 100}%` }} />
        </div>
      )}
      {video && <video src={video.url} autoPlay loop muted playsInline controls />}

      <div className="modal-actions">
        {video && (
          <a className="btn" href={video.url} download={fileName}>Descargar MP4</a>
        )}
        {canShare && (
          <button className="btn ghost" onClick={() => navigator.share({ files: [video!.file] }).catch(() => {})}>
            Compartir
          </button>
        )}
        <button className={video ? "btn ghost" : "btn"} onClick={run} disabled={busy}>
          {busy ? "Creando video…" : video ? "Crear de nuevo" : "Crear video"}
        </button>
        <button className="btn ghost" disabled={busy} onClick={() => { onClose(); onAnimate(); }}>
          Animar en la página
        </button>
        <button className="btn ghost" disabled={busy} onClick={onClose}>Cerrar</button>
      </div>
    </dialog>
  );
}
