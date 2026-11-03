-- Rode no Supabase: SQL Editor > New query > cole tudo > Run

create extension if not exists pgcrypto;

-- Conta do Instagram conectada (1 por usuário do painel)
create table if not exists ig_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ig_user_id text not null unique,          -- id usado nos webhooks (entry.id)
  username text,
  profile_picture_url text,
  access_token text not null,               -- criptografado (AES-GCM)
  token_expires_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Pastas (sessões) para organizar automações
create table if not exists folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz default now()
);

create table if not exists automations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  folder_id uuid references folders(id) on delete set null,
  name text not null default 'Nova automação',
  active boolean not null default false,
  post_ids text[] not null default '{}',     -- vazio = qualquer post
  post_previews jsonb not null default '[]', -- [{id, thumb, caption}] só para exibir
  keywords text[] not null default '{}',     -- vazio = qualquer comentário
  comment_replies text[] not null default '{}',
  welcome_message text not null default '',
  button_label text not null default 'Me envie o link',
  steps jsonb not null default '[]',         -- [{type, text, url, label, seconds}]
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  igsid text not null,                       -- id da pessoa no Instagram
  username text,
  last_comment text,
  last_automation_id uuid references automations(id) on delete set null,
  last_interaction_at timestamptz default now(),
  created_at timestamptz default now(),
  unique (user_id, igsid)
);

-- Log de tudo (também serve de métrica)
create table if not exists events (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  automation_id uuid references automations(id) on delete cascade,
  igsid text,
  type text not null,   -- comment_reply | private_reply | click | step | error
  detail text,
  created_at timestamptz default now()
);
create index if not exists events_automation_idx on events (automation_id, type);
create index if not exists events_user_idx on events (user_id, created_at desc);

-- Deduplicação: a Meta reenvia webhooks
create table if not exists processed_events (
  key text primary key,
  created_at timestamptz default now()
);

-- RLS: cada usuário só vê o que é dele
alter table ig_accounts enable row level security;
alter table folders enable row level security;
alter table automations enable row level security;
alter table contacts enable row level security;
alter table events enable row level security;
alter table processed_events enable row level security;

do $$
declare t text;
begin
  foreach t in array array['folders','automations','contacts','events'] loop
    execute format('drop policy if exists own_%1$s on %1$s', t);
    execute format('create policy own_%1$s on %1$s for all using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
  end loop;
end $$;

-- ig_accounts: o painel só lê dados não sensíveis (token é lido só pelo servidor com service role)
drop policy if exists own_ig_select on ig_accounts;
create policy own_ig_select on ig_accounts for select using (auth.uid() = user_id);

-- Storage para áudios, imagens e vídeos (URL pública que o Instagram baixa)
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do nothing;

drop policy if exists media_upload on storage.objects;
create policy media_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists media_delete on storage.objects;
create policy media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = auth.uid()::text);
