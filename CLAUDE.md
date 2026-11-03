# Responde Comentários 24H

Automação estilo ManyChat: comentário com palavra-chave no Instagram → resposta pública + DM (texto, link, áudio, mídia). Hospedado na Vercel (serverless, 24h).

## Stack
- Next.js (App Router) na Vercel
- Instagram API com Instagram Login (webhooks `comments` e `messages`)
- Banco: Supabase/Neon (Postgres) · Arquivos: Vercel Blob · Fila/atrasos: Upstash QStash · Renovação de token: Vercel Cron

## Economia de Tokens (herdado das regras globais)
- Nunca reescrever arquivos inteiros nas respostas.
- Retornar APENAS funções, métodos ou trechos modificados/adicionados.
- Ser direto e conciso; sem explicações teóricas longas.
- Comentários curtos no próprio código quando precisar explicar a lógica.
- Em erros de terminal, focar só nas linhas apontadas no stack trace.
- Ler só o trecho necessário dos arquivos (offset/limit), não o arquivo todo.
- Não usar subagentes sem pedido explícito.

## Regras da Meta (não esquecer)
- 1 resposta privada por comentário, até 7 dias depois dele.
- Janela de 24h após a pessoa responder no direct.
- PDF/arquivos: enviar por link.
- Webhook: responder 200 imediatamente; deduplicar por `comment_id`.
