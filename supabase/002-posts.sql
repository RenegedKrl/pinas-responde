-- Postagens agendadas. Rode no SQL Editor depois do schema.sql

create table if not exists posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('IMAGE','CAROUSEL','REELS')),
  items jsonb not null default '[]',        -- [{url, type: 'image'|'video'}]
  caption text not null default '',
  scheduled_at timestamptz,                 -- null = rascunho
  status text not null default 'draft',     -- draft | scheduled | publishing | published | error
  containers jsonb not null default '{}',   -- {children: [...], parent}
  ig_media_id text,
  permalink text,
  error text,
  automation jsonb,                         -- modelo da automação criada ao publicar
  published_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists posts_due_idx on posts (status, scheduled_at);

alter table posts enable row level security;
drop policy if exists own_posts on posts;
create policy own_posts on posts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Agendador: chama o publicador a cada minuto (pg_cron + pg_net, grátis no Supabase)
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.unschedule('pinas-publish') where exists (select 1 from cron.job where jobname = 'pinas-publish');
select cron.schedule('pinas-publish', '* * * * *',
  $$ select net.http_get('https://pinaschat.vercel.app/api/cron/publish') $$);
