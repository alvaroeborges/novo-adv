// scripts/refresh-ig-token.js
//
// Renova o access token de longa duração do Instagram (válido por 60 dias)
// e atualiza o secret IG_ACCESS_TOKEN no próprio repositório do GitHub.
//
// Precisa de um GH_PAT (Personal Access Token, fine-grained, com permissão
// "Secrets" de leitura/escrita neste repositório) — o GITHUB_TOKEN padrão
// do Actions não tem permissão para editar secrets, só o código-fonte.

import sodium from "libsodium-wrappers";

const IG_TOKEN = process.env.IG_ACCESS_TOKEN;
const GH_PAT = process.env.GH_PAT;
const REPO = process.env.GITHUB_REPOSITORY; // "usuario/repo", já vem do Actions

async function main() {
  if (!IG_TOKEN) throw new Error("IG_ACCESS_TOKEN ausente.");
  if (!GH_PAT) {
    throw new Error(
      "GH_PAT ausente — sem ele o script não consegue atualizar o secret no GitHub."
    );
  }

  const refreshUrl = `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${IG_TOKEN}`;
  const refreshRes = await fetch(refreshUrl);
  const refreshData = await refreshRes.json();

  if (refreshData.error) {
    throw new Error(`Erro ao renovar o token: ${refreshData.error.message}`);
  }

  const newToken = refreshData.access_token;
  console.log(`Token renovado, expira em ${refreshData.expires_in}s.`);

  await updateGithubSecret(newToken);
  console.log("Secret IG_ACCESS_TOKEN atualizado com sucesso.");
}

async function updateGithubSecret(secretValue) {
  await sodium.ready;

  const keyRes = await fetch(
    `https://api.github.com/repos/${REPO}/actions/secrets/public-key`,
    { headers: authHeaders() }
  );
  if (!keyRes.ok) {
    throw new Error(`Falha ao obter a chave pública do repositório (status ${keyRes.status}).`);
  }
  const { key, key_id } = await keyRes.json();

  const binkey = sodium.from_base64(key, sodium.base64_variants.ORIGINAL);
  const binsec = sodium.from_string(secretValue);
  const encBytes = sodium.crypto_box_seal(binsec, binkey);
  const encrypted = sodium.to_base64(encBytes, sodium.base64_variants.ORIGINAL);

  const putRes = await fetch(
    `https://api.github.com/repos/${REPO}/actions/secrets/IG_ACCESS_TOKEN`,
    {
      method: "PUT",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ encrypted_value: encrypted, key_id }),
    }
  );

  if (!putRes.ok) {
    throw new Error(`Falha ao atualizar o secret (status ${putRes.status}).`);
  }
}

function authHeaders() {
  return {
    Authorization: `Bearer ${GH_PAT}`,
    Accept: "application/vnd.github+json",
  };
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
