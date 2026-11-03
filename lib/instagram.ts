// Instagram API com Instagram Login (oficial, gratuita)
const GRAPH = "https://graph.instagram.com/v23.0";

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

async function igFetch<T = any>(url: string, init?: RequestInit): Promise<T> {
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

export function getMe(token: string) {
  return igFetch<{ user_id: string; username: string; profile_picture_url?: string }>(
    `${GRAPH}/me?fields=user_id,username,profile_picture_url&access_token=${token}`
  );
}

export function subscribeWebhooks(token: string) {
  return igFetch(
    `${GRAPH}/me/subscribed_apps?subscribed_fields=comments,messages,messaging_postbacks&access_token=${token}`,
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

export function listMedia(token: string, after?: string) {
  const f = "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp";
  return igFetch<{ data: IgMedia[]; paging?: { cursors?: { after?: string }; next?: string } }>(
    `${GRAPH}/me/media?fields=${f}&limit=24${after ? `&after=${after}` : ""}&access_token=${token}`
  );
}

// Resposta pública ao comentário
export function replyToComment(token: string, commentId: string, message: string) {
  return igFetch(`${GRAPH}/${commentId}/replies`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ message }),
  });
}

type Recipient = { id: string } | { comment_id: string };

export function sendMessage(token: string, igUserId: string, recipient: Recipient, message: object) {
  return igFetch(`${GRAPH}/${igUserId}/messages`, {
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
