import { decrypt, encrypt } from "./crypto";
import { supabaseAdmin } from "./supabase-server";

// TikTok Content Posting API (Direct Post). Docs: developers.tiktok.com/doc/content-posting-api-reference-direct-post
const API = "https://open.tiktokapis.com/v2";
export const TT_SCOPES = "user.info.basic,video.publish";
const redirect = () => `${process.env.APP_URL}/api/tiktok/callback`;

// Mídia passa pelo nosso domínio (/m/...) porque o TikTok só puxa URL de domínio verificado
export const viaApp = (url: string) =>
  url.replace(/^https:\/\/[^/]+\/storage\/v1\/object\/public\/media\//, `${process.env.APP_URL}/m/`);

export function ttAuthorizeUrl(state: string) {
  const q = new URLSearchParams({
    client_key: process.env.TIKTOK_CLIENT_KEY ?? "", scope: TT_SCOPES, response_type: "code",
    redirect_uri: redirect(), state,
  });
  return `https://www.tiktok.com/v2/auth/authorize/?${q}`;
}

async function oauth(params: Record<string, string>) {
  const r = await fetch(`${API}/oauth/token/`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: process.env.TIKTOK_CLIENT_KEY ?? "", client_secret: process.env.TIKTOK_CLIENT_SECRET ?? "", ...params,
    }),
  });
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(`TikTok OAuth: ${j.error_description || j.error || r.status}`);
  return j as { open_id: string; access_token: string; refresh_token: string; expires_in: number; refresh_expires_in: number };
}
export const ttExchange = (code: string) =>
  oauth({ code, grant_type: "authorization_code", redirect_uri: redirect() });

async function call<T = any>(token: string, path: string, body?: unknown) {
  const r = await fetch(`${API}/${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify(body ?? {}),
  });
  const j = await r.json().catch(() => ({}));
  if (j.error?.code && j.error.code !== "ok") throw new Error(`TikTok ${path}: ${j.error.message || j.error.code}`);
  if (!r.ok) throw new Error(`TikTok ${path}: HTTP ${r.status}`);
  return j.data as T;
}

export async function ttUserInfo(token: string) {
  const r = await fetch(`${API}/user/info/?fields=open_id,display_name,avatar_url`, { headers: { Authorization: `Bearer ${token}` } });
  const j = await r.json();
  return (j.data?.user ?? {}) as { display_name?: string; avatar_url?: string };
}

export async function saveTikTok(userId: string, t: Awaited<ReturnType<typeof oauth>>, extra: Record<string, unknown> = {}) {
  const now = Date.now();
  const { error } = await supabaseAdmin().from("tiktok_accounts").upsert({
    user_id: userId, open_id: t.open_id,
    access_token: encrypt(t.access_token), refresh_token: encrypt(t.refresh_token),
    token_expires_at: new Date(now + t.expires_in * 1000).toISOString(),
    refresh_expires_at: new Date(now + t.refresh_expires_in * 1000).toISOString(),
    updated_at: new Date().toISOString(), ...extra,
  });
  if (error) throw new Error(error.message);
}

// Token de acesso dura 24h: renova sozinho quando falta menos de 1h
export async function ttToken(userId: string) {
  const { data } = await supabaseAdmin().from("tiktok_accounts").select("*").eq("user_id", userId).maybeSingle();
  if (!data) return null;
  if (new Date(data.token_expires_at).getTime() - Date.now() > 3600_000) return decrypt(data.access_token);
  const t = await oauth({ grant_type: "refresh_token", refresh_token: decrypt(data.refresh_token) });
  await saveTikTok(userId, t);
  return t.access_token;
}

// Enquanto o app não passa na auditoria do TikTok, só dá para postar como privado
async function privacy(token: string) {
  const info = await call<{ privacy_level_options: string[] }>(token, "post/publish/creator_info/query/");
  const want = process.env.TIKTOK_PUBLIC === "1" ? "PUBLIC_TO_EVERYONE" : "SELF_ONLY";
  return info.privacy_level_options.includes(want) ? want : info.privacy_level_options.at(-1) ?? "SELF_ONLY";
}

export async function ttStart(token: string, p: { items: { url: string; type: string; thumb_offset?: number }[]; caption: string }) {
  const privacy_level = await privacy(token);
  const videos = p.items.filter((i) => i.type === "video");
  if (videos.length > 1) throw new Error("TikTok não aceita carrossel de vídeos (só 1 vídeo ou carrossel de fotos)");
  if (videos.length === 1 && p.items.length > 1) throw new Error("TikTok não mistura vídeo e foto no mesmo post");

  if (videos.length === 1) {
    const r = await call<{ publish_id: string }>(token, "post/publish/video/init/", {
      post_info: {
        title: p.caption.slice(0, 2200), privacy_level,
        disable_comment: false, disable_duet: false, disable_stitch: false,
        video_cover_timestamp_ms: videos[0].thumb_offset ?? 1000,
      },
      source_info: { source: "PULL_FROM_URL", video_url: viaApp(videos[0].url) },
    });
    return r.publish_id;
  }
  // carrossel de fotos (até 35); título curto + descrição longa
  const first = p.caption.split("\n")[0].slice(0, 90);
  const r = await call<{ publish_id: string }>(token, "post/publish/content/init/", {
    post_info: { title: first, description: p.caption.slice(0, 4000), privacy_level, disable_comment: false, auto_add_music: true },
    source_info: { source: "PULL_FROM_URL", photo_cover_index: 0, photo_images: p.items.slice(0, 35).map((i) => viaApp(i.url)) },
    post_mode: "DIRECT_POST", media_type: "PHOTO",
  });
  return r.publish_id;
}

export async function ttStatus(token: string, publish_id: string) {
  return call<{ status: string; fail_reason?: string; publicaly_available_post_id?: string[] }>(
    token, "post/publish/status/fetch/", { publish_id });
}
