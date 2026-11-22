"use client";

import { useEffect, useRef, useState } from "react";
import { Mode, Ranked } from "@/lib/stats";
import { STUDIOS } from "@/lib/types";

// Video del ranking: solo el cuadro, para ponerlo encima de otro video en un editor.
// Los puestos aparecen de uno en uno, del primero al último, y el puntaje de cada uno sube contando.
// Se dibuja en un canvas cuadro por cuadro y se codifica como MP4 (H.264 + AAC) en el navegador.

const FPS = 30;
const W = 1080;
const PAD = 28;
const ROW = 128;
const START = 0.4; // cuadro vacío antes del primer puesto
const APPEAR = 0.25; // entrada de cada fila
const END = 2.8; // ranking completo quieto
const RATE = 48000; // audio

const CARD = "#0d122c";
const TEXT = "#eef0f6";
const MUTED = "#98a0b8";
const MEDALS = ["#f5b942", "#c3c9d6", "#d08a5b"];

type Row = {
  name: string;
  studio: string;
  studioColor: string;
  mvp: boolean;
  img: HTMLImageElement | null;
  rank: number;
  score: number;
  unit: string;
  change: number | null; // puestos que subió (+) o bajó (−); null = nuevo
};

// Tiempos de la animación según la cantidad de filas
type Timing = { per: number; count: number; total: number };
function timing(n: number): Timing {
  const per = Math.min(1.1, Math.max(0.55, 10 / n)); // segundos por puesto
  return { per, count: per * 0.55, total: START + n * per + END };
}

export type ExportInput = {
  now: Ranked[];
  prev: Ranked[];
  mode: Mode;
  mvp: Set<string>;
  defaultV: number;
  from: number; // puestos a incluir (según el ranking actual)
  to: number;
};

const clamp = (t: number) => Math.min(1, Math.max(0, t));
const easeOut = (t: number) => 1 - (1 - t) ** 3;

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
  const fallback = input.defaultV ? `/api/photo/default?v=${input.defaultV}` : "/default-avatar.svg";
  return Promise.all(
    chosen.map(async (s) => {
      const old = prevById.get(s.player.id);
      const studio = s.player.studio ? STUDIOS[s.player.studio] : null;
      const src = s.player.photoV ? `/api/photo/${s.player.id}?v=${s.player.photoV}` : fallback;
      return {
        name: s.player.name,
        studio: studio?.label ?? "",
        studioColor: studio?.color ?? MUTED,
        mvp: input.mvp.has(s.player.id),
        img: (await loadImage(src)) ?? (await loadImage("/default-avatar.svg")),
        rank: s.rank,
        score: s.score,
        unit: s.unit,
        change: !input.prev.length ? 0 : old ? old.rank - s.rank : null,
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
  const { per, count, total } = timing(rows.length);
  const ended = clamp((t - (total - END) - 0.2) / 0.4);
  const set = (weight: number, size: number) => (c.font = `${weight} ${size}px ${font}`);

  c.fillStyle = CARD;
  c.fillRect(0, 0, W, H);
  // Líneas entre puestos
  c.fillStyle = "rgba(120, 135, 200, 0.18)";
  for (let i = 1; i < rows.length; i++) c.fillRect(PAD + 24, PAD + i * ROW - 1, W - 2 * PAD - 48, 2);

  rows.forEach((r, i) => {
    const since = t - (START + i * per); // segundos desde que le toca aparecer
    if (since <= 0) return;
    const shown = easeOut(clamp(since / APPEAR));
    const counted = clamp((since - APPEAR) / count);
    const y = PAD + i * ROW;
    const mid = y + ROW / 2;
    const medal = MEDALS[r.rank - 1];
    c.save();
    c.globalAlpha = shown;
    c.translate((1 - shown) * 90, 0); // entra desde la derecha

    // Primer puesto en dorado
    if (r.rank === 1) {
      roundRect(c, PAD, y + 4, W - 2 * PAD, ROW - 8, 22);
      const g = c.createLinearGradient(PAD, 0, W - PAD, 0);
      g.addColorStop(0, "#4a3a16");
      g.addColorStop(0.45, "#2a2540");
      g.addColorStop(1, "#6b5420");
      c.fillStyle = g;
      c.fill();
      c.strokeStyle = "rgba(245, 185, 66, 0.75)";
      c.lineWidth = 2;
      c.stroke();
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
    c.fillText(String(r.rank), px, mid + 2);

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

    // Nombre, MVP y, debajo, el studio
    const tx = PAD + 244;
    const nameY = r.studio ? mid - 18 : mid + 2;
    c.textAlign = "left";
    set(700, 40);
    c.fillStyle = TEXT;
    c.fillText(r.name, tx, nameY);
    if (r.mvp) {
      const nx = tx + c.measureText(r.name).width + 14;
      set(800, 20);
      const mw = c.measureText("MVP").width + 22;
      roundRect(c, nx, nameY - 15, mw, 30, 8);
      c.fillStyle = MEDALS[0];
      c.fill();
      c.fillStyle = "#1a1300";
      c.fillText("MVP", nx + 11, nameY + 1);
    }
    if (r.studio) {
      c.beginPath();
      c.arc(tx + 9, mid + 28, 9, 0, Math.PI * 2);
      c.fillStyle = r.studioColor;
      c.fill();
      set(400, 26);
      c.fillStyle = MUTED;
      c.fillText(r.studio, tx + 28, mid + 29);
    }

    // Puntaje: sube contando y da un pequeño salto al llegar
    const score = Math.round(r.score * easeOut(counted));
    const right = W - PAD - 30;
    c.textAlign = "right";
    set(400, 26);
    c.fillStyle = MUTED;
    c.fillText(r.unit, right, mid + 8);
    const unitW = c.measureText(r.unit).width;
    set(800, 54);
    const finalW = c.measureText(percent ? `${r.score}%` : String(r.score)).width;
    const landed = since - APPEAR - count; // segundos desde que terminó de contar
    const pop = landed > 0 && landed < 0.25 ? 1 + 0.18 * Math.sin((landed / 0.25) * Math.PI) : 1;
    const sx = right - unitW - 12;
    c.save();
    c.translate(sx - finalW / 2, mid + 2);
    c.scale(pop, pop);
    c.fillStyle = counted < 1 ? MEDALS[0] : TEXT;
    c.fillText(percent ? `${score}%` : String(score), finalW / 2, 0);
    c.restore();

    // Cambio de puesto, cuando ya están todos
    const label = r.change === null ? "NUEVO" : r.change > 0 ? `▲ ${r.change}` : r.change < 0 ? `▼ ${-r.change}` : "";
    if (label && ended > 0) {
      const bx = sx - finalW - 26;
      set(700, 24);
      const bw = c.measureText(label).width + 28;
      c.globalAlpha = ended;
      roundRect(c, bx - bw, mid - 20, bw, 40, 20);
      c.fillStyle = "#1b2145";
      c.fill();
      c.fillStyle = r.change === null ? MEDALS[0] : r.change > 0 ? "#5fd38d" : "#ef6b6b";
      c.textAlign = "center";
      c.fillText(label, bx - bw / 2, mid + 1);
    }
    c.restore();
  });
}

// Sonidos propios, sintetizados: entrada de la fila, conteo del puntaje, campanita al llegar y acorde final
async function renderAudio(rows: Row[]): Promise<AudioBuffer> {
  const { per, count, total } = timing(rows.length);
  const ctx = new OfflineAudioContext(2, Math.ceil(total * RATE), RATE);
  const master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);
  const tone = (type: OscillatorType, at: number, dur: number, f0: number, f1: number, vol: number) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, at);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(f1, at + dur);
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(vol, at + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(gain).connect(master);
    osc.start(at);
    osc.stop(at + dur + 0.02);
  };
  rows.forEach((r, i) => {
    const at = START + i * per;
    tone("sine", at, 0.16, 260, 620, 0.35); // entra la fila
    const from = at + APPEAR;
    const ticks = Math.max(4, Math.round(count / 0.05));
    for (let k = 0; k < ticks; k++)
      tone("square", from + (k / ticks) * count, 0.035, 700 + (700 * k) / ticks, 700 + (700 * k) / ticks, 0.12);
    const land = from + count;
    const high = r.rank === 1 ? 1.5 : 1; // el primero suena más agudo
    tone("sine", land, 0.45, 1318.5 * high, 1318.5 * high, 0.3);
    tone("sine", land + 0.02, 0.5, 1975.5 * high, 1975.5 * high, 0.18);
  });
  // Acorde final arpegiado
  const fin = START + rows.length * per + 0.2;
  [523.25, 659.25, 783.99, 1046.5].forEach((f, k) => {
    tone("triangle", fin + k * 0.09, 1.4, f, f, 0.3);
    tone("sine", fin + k * 0.09, 1.4, f * 2, f * 2, 0.08);
  });
  return ctx.startRendering();
}

const AUDIO = { codec: "mp4a.40.2", sampleRate: RATE, numberOfChannels: 2, bitrate: 128_000 };

async function renderVideo(
  input: ExportInput,
  sound: boolean,
  onProgress: (p: number) => void
): Promise<{ blob: Blob; silent: boolean }> {
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
  const withAudio =
    sound &&
    typeof AudioEncoder !== "undefined" &&
    !!(await AudioEncoder.isConfigSupported(AUDIO).catch(() => null))?.supported;

  const { Muxer, ArrayBufferTarget } = await import("mp4-muxer");
  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: "avc", width: canvas.width, height: canvas.height, frameRate: FPS },
    ...(withAudio ? { audio: { codec: "aac" as const, numberOfChannels: 2, sampleRate: RATE } } : {}),
    fastStart: "in-memory",
  });
  let failed: Error | null = null;
  const check = () => {
    if (failed) throw failed;
  };

  if (withAudio) {
    const buffer = await renderAudio(rows);
    const audio = new AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error: (e) => (failed = e),
    });
    audio.configure(AUDIO);
    const left = buffer.getChannelData(0);
    const rightCh = buffer.getChannelData(1);
    const STEP = RATE / 10; // bloques de 100 ms
    for (let at = 0; at < buffer.length; at += STEP) {
      const frames = Math.min(STEP, buffer.length - at);
      const data = new Float32Array(frames * 2);
      data.set(left.subarray(at, at + frames), 0);
      data.set(rightCh.subarray(at, at + frames), frames);
      const chunk = new AudioData({
        format: "f32-planar",
        sampleRate: RATE,
        numberOfChannels: 2,
        numberOfFrames: frames,
        timestamp: (at / RATE) * 1e6,
        data,
      });
      audio.encode(chunk);
      chunk.close();
    }
    await audio.flush();
    check();
  }

  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => (failed = e),
  });
  encoder.configure(config);
  const frames = Math.round(timing(rows.length).total * FPS);
  const percent = input.mode === "rate";
  for (let i = 0; i < frames; i++) {
    check();
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
  check();
  muxer.finalize();
  return { blob: new Blob([muxer.target.buffer], { type: "video/mp4" }), silent: sound && !withAudio };
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
  const [video, setVideo] = useState<{ url: string; file: File; silent: boolean } | null>(null);
  const [sound, setSound] = useState(true);
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
      const { blob, silent } = await renderVideo({ ...data, ...range }, sound, setProgress);
      const file = new File([blob], fileName, { type: "video/mp4" });
      setVideo({ url: URL.createObjectURL(blob), file, silent });
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
        Crea un MP4 solo con el cuadro del ranking, para ponerlo encima de otro video. Los puestos aparecen de uno
        en uno, del primero al último, y el puntaje de cada uno sube contando.
      </p>
      <label className="choice">
        <input type="radio" name="scope" checked={scope === "all"} disabled={busy} onChange={() => setScope("all")} />
        Ranking completo ({total} {total === 1 ? "puesto" : "puestos"})
      </label>
      <label className="choice">
        <input type="radio" name="scope" checked={scope === "range"} disabled={busy} onChange={() => setScope("range")} />
        Solo las posiciones del {num(from, setFrom, "Desde el puesto")} al {num(to, setTo, "Hasta el puesto")}
      </label>

      <label className="choice">
        <input type="checkbox" checked={sound} disabled={busy} onChange={(e) => setSound(e.target.checked)} />
        Con sonido
      </label>

      {error && <p className="notice error">{error}</p>}
      {video?.silent && (
        <p className="notice">Este navegador no puede codificar el audio (AAC), así que el video salió sin sonido.</p>
      )}
      {busy && (
        <div className="bar" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
          <i style={{ width: `${progress * 100}%` }} />
        </div>
      )}
      {video && <video src={video.url} loop playsInline controls />}

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
