// Instagram API com Instagram Login (oficial, gratuita)
// Tokens "IG..." (login do Instagram) usam graph.instagram.com; "EAA..." (login unificado/Facebook) usam graph.facebook.com
export const graph = (token: string) =>
  token.startsWith("IG") ? "https://graph.instagram.com/v23.0" : "https://graph.facebook.com/v23.0";
export const isFbToken = (token: string) => !token.startsWith("IG");

export const IG_SCOPES = [
  "instagram_business_basic",
  "instagram_business_manage_messages",
  "instagram_business_manage_comments",
].join(",");

export function redirectUri() {
  return `${process.env.APP_URL}/api/instagram/callback`;
}

export function authorizeUrl(state: string) {
  const p = new URLSearchParams({
    client_id: process.env.IG_APP_ID!,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: IG_SCOPES,
    state,
  });
  return `https://www.instagram.com/oauth/authorize?${p}`;
}

export async function igFetch<T = any>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { ...init, cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) {
    const msg = j?.error?.message || j?.error_message || `HTTP ${r.status}`;
    throw new Error(`Instagram: ${msg}`);
  }
  return j as T;
}

export async function exchangeCode(code: string) {
  const body = new URLSearchParams({
    client_id: process.env.IG_APP_ID!,
    client_secret: process.env.IG_APP_SECRET!,
    grant_type: "authorization_code",
    redirect_uri: redirectUri(),
    code,
  });
  const short = await igFetch<{ access_token: string }>(
    "https://api.instagram.com/oauth/access_token",
    { method: "POST", body }
  );
  // troca por token de ~60 dias
  const long = await igFetch<{ access_token: string; expires_in: number }>(
    `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${process.env.IG_APP_SECRET}&access_token=${short.access_token}`
  );
  return long;
}

export function refreshToken(token: string) {
  return igFetch<{ access_token: string; expires_in: number }>(
    `https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${token}`
  );
}

export async function getMe(token: string): Promise<{ user_id: string; username: string; profile_picture_url?: string }> {
  if (!isFbToken(token)) {
    return igFetch(`${graph(token)}/me?fields=user_id,username,profile_picture_url&access_token=${token}`);
  }
  const g = graph(token);
  // 1) token já é do usuário do Instagram
  try {
    const r = await igFetch<any>(`${g}/me?fields=id,username,profile_picture_url&access_token=${token}`);
    if (r.username) return { user_id: r.id, username: r.username, profile_picture_url: r.profile_picture_url };
  } catch {}
  // 2) contas do Instagram atribuídas ao token (login unificado)
  try {
    const r = await igFetch<any>(`${g}/me/assigned_instagram_accounts?fields=id,username,profile_picture_url&access_token=${token}`);
    const a = r.data?.[0];
    if (a) return { user_id: a.id, username: a.username, profile_picture_url: a.profile_picture_url };
  } catch {}
  // 3) Instagram ligado a uma Página do Facebook
  const r = await igFetch<any>(`${g}/me/accounts?fields=instagram_business_account{id,username,profile_picture_url}&access_token=${token}`);
  const a = r.data?.find((p: any) => p.instagram_business_account)?.instagram_business_account;
  if (!a) throw new Error("Nenhuma conta do Instagram encontrada para este token");
  return { user_id: a.id, username: a.username, profile_picture_url: a.profile_picture_url };
}

export function subscribeWebhooks(token: string) {
  return igFetch(
    `${graph(token)}/me/subscribed_apps?subscribed_fields=comments,messages,messaging_postbacks&access_token=${token}`,
    { method: "POST" }
  );
}

export interface IgMedia {
  id: string;
  caption?: string;
  media_type: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink: string;
  timestamp: string;
}

export function listMedia(token: string, igUserId: string, after?: string) {
  const f = "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp";
  return igFetch<{ data: IgMedia[]; paging?: { cursors?: { after?: string }; next?: string } }>(
    `${graph(token)}/${isFbToken(token) ? igUserId : "me"}/media?fields=${f}&limit=24${after ? `&after=${after}` : ""}&access_token=${token}`
  );
}

// Resposta pública ao comentário
export function replyToComment(token: string, commentId: string, message: string) {
  return igFetch(`${graph(token)}/${commentId}/replies`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ message }),
  });
}

// Primeiro comentário direto na mídia (post / reel / carrossel)
export function commentOnMedia(token: string, mediaId: string, message: string) {
  return igFetch<{ id: string }>(`${graph(token)}/${mediaId}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ message }),
  });
}

type Recipient = { id: string } | { comment_id: string };

export function sendMessage(token: string, igUserId: string, recipient: Recipient, message: object) {
  return igFetch(`${graph(token)}/${igUserId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ recipient, message }),
  });
}

export const msg = {
  text: (text: string) => ({ text }),
  // Botão que, ao ser clicado, gera um postback (abre a janela de 24h)
  buttonPostback: (text: string, title: string, payload: string) => ({
    attachment: {
      type: "template",
      payload: {
        template_type: "button",
        text: text.slice(0, 640),
        buttons: [{ type: "postback", title: title.slice(0, 20), payload }],
      },
    },
  }),
  buttonUrl: (text: string, title: string, url: string) => ({
    attachment: {
      type: "template",
      payload: {
        template_type: "button",
        text: text.slice(0, 640),
        buttons: [{ type: "web_url", title: title.slice(0, 20), url }],
      },
    },
  }),
  media: (type: "image" | "video" | "audio", url: string) => ({
    attachment: { type, payload: { url } },
  }),
};

export interface IgComment {
  id: string;
  text?: string;
  timestamp: string;
  username?: string;
  from?: { id: string; username?: string };
  replies?: { data: { from?: { id: string } }[] };
}

// Comentários de um post (com respostas, para saber se já respondemos)
export async function listComments(token: string, mediaId: string) {
  const f = "id,text,timestamp,username,from,replies{from}";
  const all: IgComment[] = [];
  let url: string | undefined = `${graph(token)}/${mediaId}/comments?fields=${f}&limit=50&access_token=${token}`;
  for (let i = 0; url && i < 20; i++) {
    const r: { data: IgComment[]; paging?: { next?: string } } = await igFetch(url);
    all.push(...r.data);
    url = r.paging?.next;
  }
  return all;
}
