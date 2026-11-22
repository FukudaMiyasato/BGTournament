"use client";

import { useEffect, useRef, useState } from "react";
import { Mode, Ranked } from "@/lib/stats";
import { STUDIOS } from "@/lib/types";

// Video del ranking: solo el cuadro, para ponerlo encima de otro video en un editor.
// Los puestos aparecen del último al primero y el puntaje de cada uno sube contando.
// Se dibuja en un canvas cuadro por cuadro y se codifica como MP4 (H.264 + AAC) en el navegador.

const FPS = 30;
const W = 1080;
const PAD = 28;
const ROW = 128;
const START = 0.2; // cuadro vacío antes del primer puesto
const END = 1.4; // ranking completo quieto
const RATE = 48000; // audio

const CARD = "#0d122c"; // fondo cuando no es transparente
const BLOCK = "#ffffff";
const INK = "#111111";
const GRAY = "#5f6368";
const GOLD = "#f5b942";
const MEDALS = [GOLD, "#c3c9d6", "#d08a5b"];

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

// Tiempos de la animación. Se va de abajo hacia arriba: primero los últimos puestos, casi seguidos;
// después el 3.º y el 2.º con calma, y al final el 1.º con una entrada especial.
// El video completo dura menos de 5 segundos, sean cuantos sean los puestos.
const FAST = { step: 0.12, appear: 0.18, count: 0.22, budget: 1.0 }; // budget: lo máximo que ocupan todos los rápidos
const SLOW = { step: 0.55, appear: 0.2, count: 0.3 };
const FIRST = { appear: 0.4, count: 0.5 };
type Timing = { starts: number[]; appears: number[]; counts: number[]; total: number };
function timing(rows: Row[]): Timing {
  const starts: number[] = [];
  const appears: number[] = [];
  const counts: number[] = [];
  const quick = rows.filter((r) => r.rank > 3).length;
  const fastStep = Math.min(FAST.step, FAST.budget / Math.max(1, quick));
  let at = START;
  let done = START;
  for (let i = rows.length - 1; i >= 0; i--) {
    const pace = rows[i].rank === 1 ? FIRST : rows[i].rank <= 3 ? SLOW : FAST;
    starts[i] = at;
    appears[i] = pace.appear;
    counts[i] = pace.count;
    done = Math.max(done, at + pace.appear + pace.count);
    at += rows[i].rank > 3 ? fastStep : SLOW.step;
  }
  return { starts, appears, counts, total: done + END };
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
// Llega pasándose un poco y vuelve (para la entrada del primero)
const easeBack = (t: number) => 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2;

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
        studioColor: studio?.color ?? GRAY,
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

// Cada puesto es un bloque blanco con texto negro; el primero va en dorado.
// clear: sin fondo detrás de los bloques, para que quede transparente.
function draw(c: CanvasRenderingContext2D, rows: Row[], t: number, font: string, percent: boolean, clear: boolean) {
  const H = c.canvas.height;
  const { starts, appears, counts, total } = timing(rows);
  const ended = clamp((t - (total - END)) / 0.3);
  const set = (weight: number, size: number) => (c.font = `${weight} ${size}px ${font}`);

  if (clear) c.clearRect(0, 0, W, H);
  else {
    c.fillStyle = CARD;
    c.fillRect(0, 0, W, H);
  }

  const after: (() => void)[] = []; // se dibuja encima de todos los bloques
  rows.forEach((r, i) => {
    const since = t - starts[i]; // segundos desde que le toca aparecer
    if (since <= 0) return;
    const first = r.rank === 1;
    const enter = clamp(since / appears[i]);
    const counted = clamp((since - appears[i]) / counts[i]);
    const landed = since - appears[i] - counts[i]; // segundos desde que terminó de contar
    const y = PAD + i * ROW;
    const mid = y + ROW / 2;
    const x0 = PAD;
    const bw = W - 2 * PAD;
    const medal = MEDALS[r.rank - 1];

    c.save();
    c.globalAlpha = clamp(enter * 2.5);
    if (first) {
      // El primero cae desde grande y rebota
      const scale = 1.35 - 0.35 * easeBack(enter);
      c.translate(W / 2, mid);
      c.scale(scale, scale);
      c.translate(-W / 2, -mid);
    } else c.translate((1 - easeOut(enter)) * 90, 0); // los demás entran desde la derecha

    // Bloque
    roundRect(c, x0, y + 5, bw, ROW - 10, 22);
    c.fillStyle = first ? GOLD : BLOCK;
    c.fill();
    if (first) {
      // Brillo que cruza el bloque al llegar
      const sweep = clamp((since - appears[i]) / 0.6);
      if (sweep > 0 && sweep < 1) {
        c.save();
        c.clip();
        const sx = x0 - 260 + (bw + 520) * sweep;
        const g = c.createLinearGradient(sx - 130, 0, sx + 130, 0);
        g.addColorStop(0, "rgba(255,255,255,0)");
        g.addColorStop(0.5, "rgba(255,255,255,0.85)");
        g.addColorStop(1, "rgba(255,255,255,0)");
        c.fillStyle = g;
        c.transform(1, 0, -0.4, 1, mid * 0.4, 0);
        c.fillRect(sx - 130, y, 260, ROW);
        c.restore();
      }
    }

    // Puesto
    const px = x0 + 62;
    c.textAlign = "center";
    c.textBaseline = "middle";
    if (medal && !first) {
      c.beginPath();
      c.arc(px, mid, 32, 0, Math.PI * 2);
      c.fillStyle = medal;
      c.fill();
    }
    set(800, first ? 52 : 38);
    c.fillStyle = INK;
    c.fillText(String(r.rank), px, mid + 2);

    // Foto
    const ax = x0 + 172;
    const ar = 46;
    c.save();
    c.beginPath();
    c.arc(ax, mid, ar, 0, Math.PI * 2);
    c.fillStyle = "#e6e8ee";
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
    c.arc(ax, mid, ar + 1.5, 0, Math.PI * 2);
    c.strokeStyle = first ? INK : "#d5d8e0";
    c.lineWidth = 3;
    c.stroke();

    // Nombre, MVP y, debajo, el studio
    const tx = x0 + 244;
    const nameY = r.studio ? mid - 18 : mid + 2;
    c.textAlign = "left";
    set(first ? 800 : 700, 40);
    c.fillStyle = INK;
    c.fillText(r.name, tx, nameY);
    if (r.mvp) {
      const nx = tx + c.measureText(r.name).width + 14;
      set(800, 20);
      const mw = c.measureText("MVP").width + 22;
      roundRect(c, nx, nameY - 15, mw, 30, 8);
      c.fillStyle = INK;
      c.fill();
      c.fillStyle = "#fff";
      c.fillText("MVP", nx + 11, nameY + 1);
    }
    if (r.studio) {
      c.beginPath();
      c.arc(tx + 9, mid + 28, 9, 0, Math.PI * 2);
      c.fillStyle = r.studioColor;
      c.fill();
      if (first) {
        c.strokeStyle = INK;
        c.lineWidth = 2;
        c.stroke();
      }
      set(500, 26);
      c.fillStyle = first ? "#3a2c00" : GRAY;
      c.fillText(r.studio, tx + 28, mid + 29);
    }

    // Puntaje: sube contando y da un pequeño salto al llegar
    const score = Math.round(r.score * easeOut(counted));
    const right = x0 + bw - 30;
    c.textAlign = "right";
    set(500, 26);
    c.fillStyle = first ? "#3a2c00" : GRAY;
    c.fillText(r.unit, right, mid + 8);
    const unitW = c.measureText(r.unit).width;
    set(800, first ? 60 : 54);
    const finalW = c.measureText(percent ? `${r.score}%` : String(r.score)).width;
    const jump = first ? 0.3 : 0.18;
    const pop = landed > 0 && landed < 0.25 ? 1 + jump * Math.sin((landed / 0.25) * Math.PI) : 1;
    const sx = right - unitW - 12;
    c.save();
    c.translate(sx - finalW / 2, mid + 2);
    c.scale(pop, pop);
    c.textAlign = "center";
    c.fillStyle = INK;
    c.fillText(percent ? `${score}%` : String(score), 0, 0);
    c.restore();

    // Cambio de puesto, cuando ya están todos
    const label = r.change === null ? "NUEVO" : r.change > 0 ? `▲ ${r.change}` : r.change < 0 ? `▼ ${-r.change}` : "";
    if (label && ended > 0) {
      const bx = sx - finalW - 26;
      set(700, 24);
      const lw = c.measureText(label).width + 28;
      c.globalAlpha = ended;
      roundRect(c, bx - lw, mid - 20, lw, 40, 20);
      c.fillStyle = first ? "rgba(0, 0, 0, 0.14)" : "#eef0f3";
      c.fill();
      c.fillStyle = r.change === null ? INK : r.change > 0 ? "#12853f" : "#c62828";
      c.textAlign = "center";
      c.fillText(label, bx - lw / 2, mid + 1);
    }
    c.restore();

    // Destellos alrededor del primero cuando termina de contar
    if (first && landed > 0 && landed < 0.9) after.push(() => {
      const k = landed / 0.9;
      c.save();
      c.globalAlpha = 1 - k * k;
      c.fillStyle = "#fff";
      c.strokeStyle = GOLD;
      c.lineWidth = 3;
      for (let n = 0; n < 14; n++) {
        const side = n % 2 ? 1 : -1; // mitad hacia arriba, mitad hacia abajo
        const sx0 = x0 + ((n + 0.5) / 14) * bw;
        const reach = (30 + ((n * 37) % 60)) * easeOut(k);
        // unas salen por debajo del bloque y otras flotan sobre él
        const cy = side > 0 ? mid + ROW / 2 - 6 + reach : mid - reach * 0.5;
        const size = (18 + ((n * 13) % 14)) * (1 - k * 0.4);
        star(c, sx0 + side * reach * 0.25, Math.max(size, Math.min(H - size, cy)), size);
      }
      c.restore();
    });
  });
  after.forEach((f) => f());
}

// Estrella de cuatro puntas
function star(c: CanvasRenderingContext2D, x: number, y: number, r: number) {
  c.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const d = i % 2 ? r * 0.38 : r;
    c.lineTo(x + Math.sin(a) * d, y - Math.cos(a) * d);
  }
  c.closePath();
  c.fill();
  c.stroke();
}

// Sonidos propios, sintetizados: entrada de cada bloque, conteo del puntaje, campanita al llegar
// y, para el primero, una subida de tono y un acorde de celebración
async function renderAudio(rows: Row[]): Promise<AudioBuffer> {
  const { starts, appears, counts, total } = timing(rows);
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
    const at = starts[i];
    const count = counts[i];
    const first = r.rank === 1;
    const soft = r.rank <= 3 ? 1 : 0.6; // los que pasan rápido suenan más suave
    if (first) tone("sawtooth", at, appears[i], 180, 900, 0.16); // subida antes de caer
    else tone("sine", at, 0.16, 260, 620, 0.35 * soft); // entra el bloque
    const from = at + appears[i];
    const ticks = Math.max(4, Math.round(count / 0.05));
    for (let k = 0; k < ticks; k++)
      tone("square", from + (k / ticks) * count, 0.035, 700 + (700 * k) / ticks, 700 + (700 * k) / ticks, 0.12);
    const land = from + count;
    if (first) {
      // Acorde de celebración arpegiado
      [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, k) => {
        tone("triangle", land + k * 0.07, 1.2, f, f, 0.3);
        tone("sine", land + k * 0.07, 1.2, f * 2, f * 2, 0.09);
      });
    } else {
      tone("sine", land, 0.45, 1318.5, 1318.5, 0.3 * soft);
      tone("sine", land + 0.02, 0.5, 1975.5, 1975.5, 0.18 * soft);
    }
  });
  return ctx.startRendering();
}

const AUDIO = { codec: "mp4a.40.2", sampleRate: RATE, numberOfChannels: 2, bitrate: 128_000 };

async function renderVideo(
  input: ExportInput,
  sound: boolean,
  clear: boolean, // fondo transparente: el video lleva arriba el color y abajo la máscara
  onProgress: (p: number) => void
): Promise<{ blob: Blob; silent: boolean }> {
  if (typeof VideoEncoder === "undefined")
    throw new Error("Este navegador no puede exportar video. Prueba con Chrome, Edge o Safari actualizados.");
  const rows = await buildRows(input);
  if (!rows.length) throw new Error("No hay jugadores en esas posiciones.");

  const scene = document.createElement("canvas");
  scene.width = W;
  scene.height = PAD * 2 + ROW * rows.length; // siempre par
  const c = scene.getContext("2d")!;
  // El MP4 no guarda transparencia: se exporta el doble de alto, con el color (sobre negro) arriba
  // y la transparencia como máscara en blanco y negro abajo. scripts/transparente.mjs los une en un MOV.
  const canvas = clear ? document.createElement("canvas") : scene;
  const mask = document.createElement("canvas");
  if (clear) {
    canvas.width = mask.width = W;
    mask.height = scene.height;
    canvas.height = scene.height * 2;
  }
  const out = canvas.getContext("2d")!;
  const m = mask.getContext("2d")!;
  const compose = () => {
    if (!clear) return;
    m.globalCompositeOperation = "copy";
    m.drawImage(scene, 0, 0);
    m.globalCompositeOperation = "source-in";
    m.fillStyle = "#fff";
    m.fillRect(0, 0, W, mask.height);
    out.fillStyle = "#000";
    out.fillRect(0, 0, W, canvas.height);
    out.drawImage(scene, 0, 0);
    out.drawImage(mask, 0, scene.height);
  };
  const font = getComputedStyle(document.body).fontFamily;
  await Promise.all([400, 700, 800].map((w) => document.fonts.load(`${w} 40px ${font}`).catch(() => null)));

  // H.264: nivel 4.0 hasta ~2 millones de píxeles; más alto para rankings largos
  const big = canvas.width * canvas.height > 2_000_000;
  const codecs = big ? ["avc1.640033", "avc1.4d0033"] : ["avc1.640028", "avc1.4d0028", "avc1.42002a"];
  let config: VideoEncoderConfig | null = null;
  for (const codec of codecs) {
    const candidate = { codec, width: canvas.width, height: canvas.height, bitrate: clear ? 14_000_000 : 8_000_000, framerate: FPS };
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
  const frames = Math.round(timing(rows).total * FPS);
  const percent = input.mode === "rate";
  for (let i = 0; i < frames; i++) {
    check();
    draw(c, rows, i / FPS, font, percent, clear);
    compose();
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
  fileBase: string; // nombre del archivo sin extensión; se le agrega la hora para que no se repita
  onClose: () => void;
  onAnimate: () => void; // animación en la propia página
};

export function ExportModal({ fileBase, onClose, onAnimate, ...data }: Props) {
  const total = data.now.length;
  const [scope, setScope] = useState<"all" | "range">("all");
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(Math.min(10, total));
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [video, setVideo] = useState<{ url: string; file: File; silent: boolean; clear: boolean } | null>(null);
  const [sound, setSound] = useState(true);
  const [clear, setClear] = useState(false);
  const [copied, setCopied] = useState(false);
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
    setCopied(false);
    setProgress(0);
    try {
      const { blob, silent } = await renderVideo({ ...data, ...range }, sound, clear, setProgress);
      // Fecha de la sesión + hora de creación: cada video tiene un nombre distinto
      const time = new Date().toTimeString().slice(0, 8).replace(/:/g, "");
      const name = `${fileBase}-${time}${clear ? "-alfa" : ""}.mp4`;
      const file = new File([blob], name, { type: "video/mp4" });
      setVideo({ url: URL.createObjectURL(blob), file, silent, clear });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear el video");
    }
    setProgress(null);
  };

  const command = `npm run transparente -- Downloads/${video?.file.name ?? ""}`;
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
        Crea un MP4 solo con los bloques del ranking, para ponerlo encima de otro video. Aparecen de abajo hacia
        arriba: primero los últimos puestos, casi seguidos, y al final el 3.º, el 2.º y el 1.º.
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
      <label className="choice">
        <input type="checkbox" checked={clear} disabled={busy} onChange={(e) => setClear(e.target.checked)} />
        Fondo transparente (necesita un paso más en la Mac)
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
      {video && (
        <div className={video.clear ? "preview clear" : "preview"}>
          <video
            src={video.url}
            loop
            playsInline
            controls={!video.clear}
            autoPlay={video.clear}
            muted={video.clear}
            onLoadedMetadata={(e) => {
              // Con máscara, el recuadro tiene la proporción de la mitad de arriba
              const v = e.currentTarget;
              if (video.clear) v.parentElement!.style.aspectRatio = `${v.videoWidth} / ${v.videoHeight / 2}`;
            }}
          />
        </div>
      )}
      {video?.clear && (
        <div className="notice">
          <p>
            Este archivo todavía no es transparente: trae el color y la máscara. Descárgalo y, en la carpeta del
            proyecto, ejecuta en la Terminal:
          </p>
          <div className="command">
            <code>{command}</code>
            <button
              className="btn ghost small"
              onClick={(e) => {
                // Si el navegador no deja copiar, al menos queda seleccionado para Cmd+C
                const code = e.currentTarget.previousElementSibling!;
                navigator.clipboard.writeText(command).then(
                  () => setCopied(true),
                  () => getSelection()?.selectAllChildren(code)
                );
              }}
            >
              {copied ? "Copiado ✓" : "Copiar"}
            </button>
          </div>
          <p>Eso crea al lado un <strong>.mov</strong> con fondo transparente, listo para pasarlo al iPhone.</p>
        </div>
      )}

      <div className="modal-actions">
        {video && (
          <a className="btn" href={video.url} download={video.file.name}>Descargar MP4</a>
        )}
        {canShare && !video!.clear && (
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
