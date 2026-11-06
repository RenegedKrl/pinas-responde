-- Primeiro comentário automático após postagem (para merchandising e fixação)
alter table posts add column if not exists first_comment text;
alter table posts add column if not exists first_comment_id text;
