import { accountByUser } from "./accounts";
import { commentOnMedia, graph, igFetch } from "./instagram";
import { supabaseAdmin } from "./supabase-server";
import { ttStart, ttStatus, ttToken } from "./tiktok";

// Opções do Reels ficam no próprio item (sem migração no banco)
export interface PostItem { url: string; type: "image" | "video"; cover?: string; thumb_offset?: number; share_to_feed?: boolean }
export interface Post {
  id: string; user_id: string; kind: "IMAGE" | "CAROUSEL" | "REELS";
  items: PostItem[]; caption: string; scheduled_at: string | null; status: string;
  containers: { children?: string[]; parent?: string };
  automation: Record<string, any> | null;
  first_comment?: string | null;
  first_comment_id?: string | null;
  targets?: string[]; ig_media_id?: string | null; error?: string | null;
  tiktok?: { status?: string; publish_id?: string; error?: string };
}

type Acc = NonNullable<Awaited<ReturnType<typeof accountByUser>>>;

async function post<T = any>(acc: Acc, path: string, params: Record<string, string>) {
  return igFetch<T>(`${graph(acc.token)}/${path}`, {
    method: "POST",
    body: new URLSearchParams({ ...params, access_token: acc.token }),
  });
}
const get = <T = any>(acc: Acc, path: string, fields: string) =>
  igFetch<T>(`${graph(acc.token)}/${path}?fields=${fields}&access_token=${acc.token}`);

async function status(acc: Acc, id: string) {
  const r = await get<{ status_code?: string; status?: string }>(acc, id, "status_code,status");
  if (r.status_code === "ERROR" || r.status_code === "EXPIRED") throw new Error(`Container ${id}: ${r.status ?? r.status_code}`);
  return r.status_code ?? "FINISHED";
}

// Quanto ainda pode publicar hoje (também serve para testar a permissão instagram_content_publish)
export async function publishingLimit(acc: Acc) {
  return get<{ data: { quota_usage: number; config?: { quota_total: number } }[] }>(
    acc, `${acc.ig_user_id}/content_publishing_limit`, "quota_usage,config");
}

async function save(id: string, patch: Record<string, unknown>) {
  await supabaseAdmin().from("posts").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
}

// Avança a publicação o quanto der. Vídeos levam tempo: o cron chama de novo no minuto seguinte.
export async function advance(p: Post): Promise<"published" | "waiting"> {
  const acc = await accountByUser(p.user_id);
  if (!acc) throw new Error("Instagram não conectado");
  const ig = acc.ig_user_id;
  const c = { ...p.containers };

  // 1) containers dos itens
  if (!c.children) {
    if (p.kind === "CAROUSEL") {
      if (p.items.length < 2 || p.items.length > 10) throw new Error("Carrossel precisa de 2 a 10 itens");
      c.children = [];
      for (const it of p.items) {
        const r = await post<{ id: string }>(acc, `${ig}/media`, it.type === "video"
          ? { media_type: "VIDEO", video_url: it.url, is_carousel_item: "true" }
          : { image_url: it.url, is_carousel_item: "true" });
        c.children.push(r.id);
      }
    } else {
      const it = p.items[0];
      if (!it) throw new Error("Sem mídia");
      const r = await post<{ id: string }>(acc, `${ig}/media`, p.kind === "REELS"
        ? {
            media_type: "REELS", video_url: it.url, caption: p.caption,
            share_to_feed: it.share_to_feed === false ? "false" : "true",
            ...(it.cover ? { cover_url: it.cover } : it.thumb_offset != null ? { thumb_offset: String(it.thumb_offset) } : {}),
          }
        : { image_url: it.url, caption: p.caption });
      c.children = [r.id];
      c.parent = r.id;
    }
    await save(p.id, { containers: c, status: "publishing" });
  }

  // 2) espera os itens processarem
  for (const id of c.children) if ((await status(acc, id)) !== "FINISHED") return "waiting";

  // 3) container do carrossel
  if (!c.parent) {
    const r = await post<{ id: string }>(acc, `${ig}/media`, {
      media_type: "CAROUSEL", children: c.children.join(","), caption: p.caption,
    });
    c.parent = r.id;
    await save(p.id, { containers: c });
  }
  if ((await status(acc, c.parent)) !== "FINISHED") return "waiting";

  // 4) publica
  const pub = await post<{ id: string }>(acc, `${ig}/media_publish`, { creation_id: c.parent });
  const info = await get<{ permalink?: string }>(acc, pub.id, "permalink").catch(() => ({ permalink: undefined }));
  await save(p.id, {
    ig_media_id: pub.id, permalink: info.permalink ?? null,
    published_at: new Date().toISOString(), error: null,
  });

  // 4.1) primeiro comentário automático (merchandising)
  const firstComment = p.first_comment || p.automation?.first_comment;
  if (firstComment && !p.automation?.first_comment_id) {
    try {
      const commentRes = await commentOnMedia(acc.token, pub.id, firstComment);
      const updatedAuto = { ...(p.automation || {}), first_comment: firstComment, first_comment_id: commentRes.id };
      await save(p.id, { automation: updatedAuto, first_comment: firstComment, first_comment_id: commentRes.id }).catch(() => {
        return save(p.id, { automation: updatedAuto });
      });
    } catch (e: any) {
      console.error("Erro ao postar primeiro comentário:", e?.message || e);
    }
  }

  // 5) cria a automação do CTA já ligada ao post novo
  if (p.automation) {
    const a = p.automation;
    await supabaseAdmin().from("automations").insert({
      user_id: p.user_id,
      folder_id: a.folder_id ?? null,
      name: a.name ?? `Post ${new Date().toLocaleDateString("pt-BR")}`,
      active: true,
      post_ids: [pub.id],
      post_previews: [{ id: pub.id, caption: p.caption.slice(0, 80) }],
      keywords: a.keywords ?? [],
      comment_replies: a.comment_replies ?? ["Te mandei no direct! 📩"],
      welcome_message: a.welcome_message ?? "Oi! Vi seu comentário. Clica no botão abaixo que eu te envio 👇",
      button_label: a.button_label ?? "Quero receber",
      steps: a.steps ?? [],
    });
  }
  return "published";
}

// TikTok: inicia o post e depois consulta até terminar
async function advanceTikTok(p: Post) {
  const t = { ...(p.tiktok ?? {}) };
  if (t.status === "published" || t.status === "error") return t;
  const token = await ttToken(p.user_id);
  if (!token) throw new Error("TikTok não conectado");
  if (!t.publish_id) {
    t.publish_id = await ttStart(token, p);
    t.status = "processing";
  } else {
    const s = await ttStatus(token, t.publish_id);
    if (s.status === "PUBLISH_COMPLETE") t.status = "published";
    else if (s.status === "FAILED") { t.status = "error"; t.error = s.fail_reason ?? "falhou"; }
  }
  await save(p.id, { tiktok: t });
  return t;
}

// Processa tudo que está vencido (Instagram e/ou TikTok)
export async function runDue(limitMs = 50_000) {
  const start = Date.now();
  const { data } = await supabaseAdmin().from("posts").select("*")
    .in("status", ["scheduled", "publishing"]).lte("scheduled_at", new Date().toISOString())
    .order("scheduled_at").limit(10);
  const out: Record<string, string> = {};
  for (const p of (data as Post[]) ?? []) {
    if (Date.now() - start > limitMs) break;
    // trava simples: só um tick por vez mexe no mesmo post
    const { data: lock } = await supabaseAdmin().from("posts")
      .update({ updated_at: new Date().toISOString() }).eq("id", p.id).eq("updated_at", (p as any).updated_at).select("id");
    if (!lock?.length) continue;
    const targets = p.targets?.length ? p.targets : ["instagram"];

    // Instagram
    let igDone = !targets.includes("instagram") || !!p.ig_media_id || !!p.error;
    let igErr = p.error ?? null;
    if (!igDone) {
      try { igDone = (await advance(p)) === "published"; }
      catch (e: any) { igDone = true; igErr = String(e.message).slice(0, 500); await save(p.id, { error: igErr }); }
    }

    // TikTok
    let tt = p.tiktok ?? {};
    if (targets.includes("tiktok")) {
      try { tt = await advanceTikTok(p); }
      catch (e: any) { tt = { ...tt, status: "error", error: String(e.message).slice(0, 500) }; await save(p.id, { tiktok: tt }); }
    }
    const ttDone = !targets.includes("tiktok") || tt.status === "published" || tt.status === "error";

    if (igDone && ttDone) {
      const okIg = targets.includes("instagram") && !igErr;
      const okTt = targets.includes("tiktok") && tt.status === "published";
      await save(p.id, { status: okIg || okTt ? "published" : "error", published_at: new Date().toISOString() });
      out[p.id] = okIg || okTt ? "published" : "error";
    } else {
      if (p.status !== "publishing") await save(p.id, { status: "publishing" });
      out[p.id] = "waiting";
    }
  }
  return out;
}
