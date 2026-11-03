# Pinas Responde

Automação estilo ManyChat para Instagram: comentário com palavra-chave → resposta pública + direct com botão → sequência (texto, link, imagem, vídeo, áudio, espera). Roda 24h na Vercel usando a API oficial e gratuita da Meta.

## Como funciona
1. Alguém comenta num post escolhido com uma palavra-chave.
2. O webhook (`/api/webhook`) recebe, responde no comentário (frase sorteada) e manda 1 direct com botão.
3. Ao clicar no botão (ou responder o direct), a sequência configurada é enviada.
4. Tudo fica registrado em Contatos e Atividade.

## Configuração (uma vez)

### 1. Supabase
- SQL Editor → New query → cole `supabase/schema.sql` → **Run**.
- Authentication → URL Configuration → **Site URL** = URL da Vercel; adicione `https://SEU-APP.vercel.app/auth/callback` em Redirect URLs.

### 2. Vercel
- Add New → Project → importe `RenegedKrl/pinas-responde` → Deploy.
- Settings → Environment Variables: copie todas de `.env.example` (valores do seu `.env.local`), com `APP_URL=https://SEU-APP.vercel.app`.
- Redeploy.

### 3. App da Meta (developers.facebook.com)
- Criar app → tipo **Empresa** → adicionar produto **Instagram** → "API setup with Instagram login".
- Copie **Instagram App ID** e **App Secret** para `IG_APP_ID` e `IG_APP_SECRET` (na Vercel) e faça Redeploy.
- **Webhooks**: Callback URL `https://SEU-APP.vercel.app/api/webhook`, Verify token = `WEBHOOK_VERIFY_TOKEN`. Assine `comments`, `messages`, `messaging_postbacks`.
- **Business login settings**: Redirect URL `https://SEU-APP.vercel.app/api/instagram/callback`.
- Política de privacidade: `https://SEU-APP.vercel.app/privacidade`.
- Em modo desenvolvimento, adicione sua conta do Instagram como **testador** (App roles) e aceite o convite no Instagram.
- Deixe o app em modo **Live** para receber webhooks de comentários de outras pessoas.

### 4. Usar
- Abra o painel, crie sua conta, clique em **Conectar Instagram**.
- Automações → Nova → escolha posts, palavras, respostas, mensagem e sequência → marque **Ativa** → Salvar.

### Opcional: QStash (esperas longas)
Upstash → QStash → copie `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY` para a Vercel. Sem ele, esperas ficam limitadas a 8s.

## Regras da Meta
- 1 direct por comentário, em até 7 dias.
- Depois que a pessoa interage, janela de 24h para mensagens.
- PDF e arquivos: envie por link.

## Dev local
```bash
npm install
npm run dev
```
