// =============================================================================
//  Gera o GOOGLE_REFRESH_TOKEN uma única vez.
//
//  Uso:
//    1. Preencha no .env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET,
//       GOOGLE_REDIRECT_URI (ex.: http://localhost:3000/oauth2callback)
//    2. Rode:  npm run token
//    3. Abra o link mostrado no navegador JÁ LOGADO como
//       rodriguesadvocacia.adv01@gmail.com e autorize.
//    4. Copie a linha GOOGLE_REFRESH_TOKEN=... para o seu .env
// =============================================================================

require("dotenv").config();

const http = require("http");
const { URL } = require("url");
const { getOAuth2Client, SCOPES } = require("./googleCalendar");

const oAuth2Client = getOAuth2Client();

let redirect;
try {
  redirect = new URL(process.env.GOOGLE_REDIRECT_URI);
} catch {
  console.error(
    "GOOGLE_REDIRECT_URI inválida ou ausente no .env. " +
      "Use algo como http://localhost:3000/oauth2callback"
  );
  process.exit(1);
}

const port = Number(redirect.port || 80);

const authUrl = oAuth2Client.generateAuthUrl({
  access_type: "offline", // pede o refresh_token
  prompt: "consent", // força a tela de consentimento (garante refresh_token)
  scope: SCOPES,
});

console.log("\n──────────────────────────────────────────────────────────────");
console.log(" 1) Abra este link no navegador logado como a conta principal:");
console.log("──────────────────────────────────────────────────────────────\n");
console.log(authUrl + "\n");

const server = http.createServer(async (req, res) => {
  try {
    const reqUrl = new URL(req.url, `http://localhost:${port}`);
    if (reqUrl.pathname !== redirect.pathname) {
      res.statusCode = 404;
      res.end("Aguardando o callback do Google...");
      return;
    }

    const code = reqUrl.searchParams.get("code");
    const err = reqUrl.searchParams.get("error");
    if (err) {
      res.end("Autorização negada: " + err);
      console.error("\nAutorização negada:", err);
      server.close();
      return;
    }
    if (!code) {
      res.end("Sem 'code' na URL de retorno.");
      return;
    }

    const { tokens } = await oAuth2Client.getToken(code);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(
      "<h2>Pronto!</h2><p>Pode fechar esta aba e voltar ao terminal.</p>"
    );

    console.log("\n──────────────────────────────────────────────────────────────");
    if (tokens.refresh_token) {
      console.log(" 2) Copie a linha abaixo para o seu arquivo .env:\n");
      console.log("GOOGLE_REFRESH_TOKEN=" + tokens.refresh_token + "\n");
    } else {
      console.log(
        " Nenhum refresh_token retornado.\n" +
          " Isso acontece quando o app já tinha sido autorizado antes.\n" +
          " Remova o acesso em https://myaccount.google.com/permissions\n" +
          " e rode `npm run token` novamente."
      );
    }
    console.log("──────────────────────────────────────────────────────────────\n");
    server.close();
  } catch (e) {
    res.statusCode = 500;
    res.end("Erro ao trocar o code por token: " + e.message);
    console.error("\nErro:", e.message);
    server.close();
  }
});

server.listen(port, () => {
  console.log(
    `(servidor local de callback ouvindo em ${process.env.GOOGLE_REDIRECT_URI})\n`
  );
});
