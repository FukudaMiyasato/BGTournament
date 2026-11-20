import { promises as fs } from "fs";
import path from "path";
import { Redis } from "@upstash/redis";
import { DB, normalize } from "./types";

// Producción: Upstash Redis (integración de Vercel). Local: archivos en .data/
const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = url && token ? new Redis({ url, token }) : null;

const DIR = path.join(process.cwd(), ".data");
const DB_KEY = "bgt:db";
const photoKey = (id: string) => `bgt:photo:${id}`;

function assertStorage() {
  if (!redis && process.env.VERCEL) {
    throw new Error(
      "Falta la base de datos: conecta Upstash Redis al proyecto en Vercel (Storage) y vuelve a desplegar."
    );
  }
}

async function readFile(name: string): Promise<string | null> {
  try {
    return await fs.readFile(path.join(DIR, name), "utf8");
  } catch {
    return null;
  }
}
async function writeFile(name: string, data: string) {
  await fs.mkdir(DIR, { recursive: true });
  await fs.writeFile(path.join(DIR, name), data);
}

export async function loadDB(): Promise<DB> {
  assertStorage();
  let db: DB | null;
  if (redis) db = await redis.get<DB>(DB_KEY);
  else {
    const raw = await readFile("db.json");
    db = raw ? JSON.parse(raw) : null;
  }
  return normalize(db);
}

export async function saveDB(db: DB) {
  assertStorage();
  if (redis) await redis.set(DB_KEY, db);
  else await writeFile("db.json", JSON.stringify(db, null, 2));
}

export async function loadPhoto(id: string): Promise<string | null> {
  assertStorage();
  if (!/^[a-z0-9]+$/i.test(id)) return null;
  if (redis) return await redis.get<string>(photoKey(id));
  return await readFile(`photo-${id}.txt`);
}

export async function savePhoto(id: string, dataUrl: string) {
  assertStorage();
  if (redis) await redis.set(photoKey(id), dataUrl);
  else await writeFile(`photo-${id}.txt`, dataUrl);
}

export async function deletePhoto(id: string) {
  assertStorage();
  if (redis) await redis.del(photoKey(id));
  else await fs.rm(path.join(DIR, `photo-${id}.txt`), { force: true });
}
