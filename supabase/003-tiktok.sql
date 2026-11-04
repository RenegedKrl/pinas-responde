-- TikTok: conta conectada + em quais redes cada post sai
create table if not exists tiktok_accounts (
  user_id uuid primary key references auth.users on delete cascade,
  open_id text not null,
  username text,
  avatar_url text,
  access_token text not null,      -- criptografado
  refresh_token text not null,     -- criptografado
  token_expires_at timestamptz not null,
  refresh_expires_at timestamptz not null,
  updated_at timestamptz default now()
);
alter table tiktok_accounts enable row level security;
drop policy if exists own_tiktok on tiktok_accounts;
create policy own_tiktok on tiktok_accounts for select using (auth.uid() = user_id);

alter table posts add column if not exists targets text[] not null default '{instagram}';
-- {status: pending|processing|published|error|skipped, publish_id, error}
alter table posts add column if not exists tiktok jsonb not null default '{}';
