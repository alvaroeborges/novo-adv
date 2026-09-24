// Cloudflare Worker — recebe o formulário "Deixe sua mensagem" do site e
// entrega a mensagem no WhatsApp do advogado via CallMeBot.
//
// Segredos (nunca no código): CALLMEBOT_PHONE e CALLMEBOT_APIKEY.
// Variável comum (wrangler.toml): ALLOWED_ORIGIN — origem do site, ex.: https://usuario.github.io

const MAX = { nome: 80, whatsapp: 20, mensagem: 1000 };

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const cors = {
      "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      Vary: "Origin",
    };
    const reply = (status, body) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { ...cors, "Content-Type": "application/json" },
      });

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST") return reply(405, { ok: false, error: "method_not_allowed" });

    // Só aceita chamadas vindas do próprio site.
    if (origin !== env.ALLOWED_ORIGIN) return reply(403, { ok: false, error: "forbidden" });

    let data;
    try {
      data = await request.json();
    } catch {
      return reply(400, { ok: false, error: "invalid_json" });
    }

    // Campo-isca: humanos não veem nem preenchem; robôs sim. Finge sucesso e descarta.
    if (data.site) return reply(200, { ok: true });

    const nome = String(data.nome ?? "").trim();
    const whatsapp = String(data.whatsapp ?? "").trim();
    const mensagem = String(data.mensagem ?? "").trim();
    const digits = whatsapp.replace(/\D/g, "");

    if (!nome || !mensagem || digits.length < 10) {
      return reply(400, { ok: false, error: "invalid_fields" });
    }
    if (nome.length > MAX.nome || whatsapp.length > MAX.whatsapp || mensagem.length > MAX.mensagem) {
      return reply(400, { ok: false, error: "too_long" });
    }

    const text =
      `Olá! Você recebeu uma nova mensagem\n` +
      `*Nome:* ${nome}\n` +
      `*Telefone:* ${whatsapp}\n\n` +
      `*Mensagem:* ${mensagem}`;

    const url =
      "https://api.callmebot.com/whatsapp.php" +
      `?phone=${encodeURIComponent(env.CALLMEBOT_PHONE)}` +
      `&text=${encodeURIComponent(text)}` +
      `&apikey=${encodeURIComponent(env.CALLMEBOT_APIKEY)}`;

    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.error("CallMeBot", res.status, (await res.text()).slice(0, 300));
        return reply(502, { ok: false, error: "delivery_failed" });
      }
    } catch (err) {
      console.error("CallMeBot fetch", err);
      return reply(502, { ok: false, error: "delivery_failed" });
    }

    return reply(200, { ok: true });
  },
};
