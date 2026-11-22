#!/usr/bin/env node
// Convierte el MP4 "-alfa" que exporta la web (color arriba, máscara abajo) en un MOV HEVC con
// fondo transparente, que es el formato que aceptan el iPhone y Edits de Instagram.
// Uso: npm run transparente -- Downloads/ranking-2026-11-15-104233-alfa.mp4
// Necesita macOS (avconvert) y ffmpeg (brew install ffmpeg).
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";

const fail = (msg) => {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
};
const has = (cmd) => spawnSync("which", [cmd]).status === 0;

const arg = process.argv[2];
if (!arg) fail("Indica el archivo: npm run transparente -- Downloads/ranking-2026-11-15-104233-alfa.mp4");
// Se acepta la ruta tal cual, relativa a la carpeta personal (Downloads/archivo.mp4) o solo el nombre
// de un archivo que esté en Descargas
const typed = arg.replace(/^~(?=\/)/, homedir());
const input = [path.resolve(typed), path.join(homedir(), typed), path.join(homedir(), "Downloads", path.basename(typed))].find(
  (p) => existsSync(p)
);
if (!input) fail(`No encuentro el archivo ${arg} (lo busqué aquí, en tu carpeta personal y en Descargas).`);
if (process.platform !== "darwin" || !has("avconvert")) fail("Este paso solo funciona en una Mac (usa avconvert).");
if (!has("ffmpeg")) fail("Falta ffmpeg. Instálalo con: brew install ffmpeg");

const output = input.replace(/(-alfa)?\.mp4$/i, "") + "-transparente.mov";
const tmp = mkdtempSync(path.join(tmpdir(), "ranking-"));
const middle = path.join(tmp, "intermedio.mov");

try {
  console.log("1/2 Uniendo color y máscara…");
  // La mitad de abajo pasa a ser el canal alfa; después se deshace la mezcla con negro del color
  const filter =
    "[0:v]crop=iw:ih/2:0:0,format=gbrp[color];" +
    "[0:v]crop=iw:ih/2:0:ih/2,format=gbrp,extractplanes=g[mask];" +
    "[color][mask]alphamerge,unpremultiply=inplace=1,format=yuva444p10le[v]";
  const merge = spawnSync(
    "ffmpeg",
    ["-hide_banner", "-loglevel", "error", "-y", "-i", input, "-filter_complex", filter, "-map", "[v]", "-map", "0:a?",
      "-c:v", "prores_ks", "-profile:v", "4444", "-c:a", "pcm_s16le", middle],
    { stdio: "inherit" }
  );
  if (merge.status !== 0) fail("ffmpeg no pudo procesar el video. ¿Es el archivo \"-alfa\" exportado con fondo transparente?");

  console.log("2/2 Codificando el MOV con transparencia…");
  rmSync(output, { force: true });
  const convert = spawnSync(
    "avconvert",
    ["--preset", "PresetHEVCHighestQualityWithAlpha", "--source", middle, "--output", output],
    { stdio: "ignore" }
  );
  if (convert.status !== 0 || !existsSync(output)) fail("avconvert no pudo crear el MOV.");
  console.log(`\n✓ Listo: ${output}\n  Pásalo al iPhone por AirDrop y agrégalo como capa encima de tu video.`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
