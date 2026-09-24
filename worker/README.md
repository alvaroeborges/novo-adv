# Formulário → WhatsApp (Cloudflare Worker + CallMeBot)

O formulário "Deixe sua mensagem" envia os dados para este Worker, que repassa
a mensagem ao WhatsApp do advogado. O cliente não precisa abrir o WhatsApp.

## 1. Ativar o CallMeBot (feito pelo Jonathan, uma única vez)

Pelo WhatsApp do número que vai **receber** as mensagens (34 98435-8440):

1. Salve o contato do bot com o número que aparece em https://www.callmebot.com/blog/free-api-whatsapp-messages/
   (o número do bot muda de tempos em tempos, use o da página).
2. Mande para ele exatamente: `I allow callmebot to send me messages`
3. Em alguns instantes o bot responde com a **apikey**. Guarde-a.

## 2. Publicar o Worker

Precisa de uma conta gratuita em https://dash.cloudflare.com.

```bash
cd worker
npx wrangler login
npx wrangler secret put CALLMEBOT_PHONE    # digite: 5534984358440
npx wrangler secret put CALLMEBOT_APIKEY   # cole a apikey do bot
npx wrangler deploy
```

No final, o `deploy` mostra a URL, algo como
`https://adv-formulario.SEU-USUARIO.workers.dev`.

## 3. Ligar o site ao Worker

No `script.js`, preencha a constante `CONTACT_API_URL` com essa URL e
publique o site. Enquanto ela estiver vazia (ou se o envio falhar), o
formulário cai no modo antigo: abre o WhatsApp com a mensagem pronta.

## Testar

```bash
curl -X POST https://adv-formulario.SEU-USUARIO.workers.dev \
  -H "Origin: https://alvaroeborges.github.io" \
  -H "Content-Type: application/json" \
  -d '{"nome":"Teste","whatsapp":"(34) 99999-9999","mensagem":"Olá"}'
```

Deve responder `{"ok":true}` e a mensagem chegar no WhatsApp.

## Limites

- CallMeBot é um serviço gratuito e não oficial: aceita poucas mensagens por
  minuto e pode mudar as regras. Para um volume alto, migre para a API oficial
  do WhatsApp (Meta Cloud API) trocando só o trecho do `fetch` em `index.js`.
- O Worker só aceita chamadas com `Origin` igual a `ALLOWED_ORIGIN`.
