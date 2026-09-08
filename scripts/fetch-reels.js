// scripts/fetch-reels.js
//
// Busca os reels mais recentes da conta do Instagram via Graph API e
// atualiza o reels.json usado pelo site. Pensado para rodar via GitHub
// Actions (cron), mas funciona local também:
//
//   IG_ACCESS_TOKEN=xxxxx node scripts/fetch-reels.js

import { writeFile, readFile } from "node:fs/promises";

const ACCESS_TOKEN = process.env.IG_ACCESS_TOKEN;
const API_VERSION = "v25.0";
const MAX_REELS = 6;
const OUTPUT_PATH = new URL("../reels.json", import.meta.url);

async function main() {
  if (!ACCESS_TOKEN) {
    throw new Error(
      "IG_ACCESS_TOKEN não encontrado. Configure o secret no repositório (Settings > Secrets and variables > Actions)."
    );
  }

  const fields = [
    "id",
    "caption",
    "media_type",
    "media_product_type",
    "permalink",
    "thumbnail_url",
    "timestamp",
  ].join(",");

  const url = `https://graph.instagram.com/${API_VERSION}/me/media?fields=${fields}&access_token=${ACCESS_TOKEN}`;

  const response = await fetch(url);
  const data = await response.json();

  if (data.error) {
    const dica =
      data.error.code === 190
        ? " O token expirou ou é inválido — rode a renovação (refresh-ig-token) ou gere um novo."
        : "";
    throw new Error(`Erro da API do Instagram: ${data.error.message}.${dica}`);
  }

  const reels = (data.data ?? [])
    .filter((item) => item.media_product_type === "REELS")
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, MAX_REELS)
    .map((item) => ({
      id: item.id,
      caption: item.caption ?? "",
      permalink: item.permalink,
      thumbnail_url: item.thumbnail_url ?? null,
      timestamp: item.timestamp,
    }));

  const previous = await readExisting();
  const changed = JSON.stringify(previous) !== JSON.stringify(reels);

  if (!changed) {
    console.log("Nenhum reel novo. reels.json permanece igual.");
    return;
  }

  await writeFile(OUTPUT_PATH, JSON.stringify(reels, null, 2) + "\n", "utf-8");
  console.log(`reels.json atualizado com ${reels.length} reel(s).`);
}

async function readExisting() {
  try {
    const raw = await readFile(OUTPUT_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
