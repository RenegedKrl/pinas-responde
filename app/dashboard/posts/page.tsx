"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import PostPreview from "@/components/PostPreview";

interface Item { url: string; type: "image" | "video"; cover?: string; thumb_offset?: number; share_to_feed?: boolean }
interface Post {
  id: string; kind: string; items: Item[]; caption: string; scheduled_at: string | null;
  status: string; permalink: string | null; targets?: string[]; tiktok?: { status?: string; error?: string }; error: string | null; automation: any; published_at: string | null;
}

const STATUS: Record<string, [string, string]> = {
  draft: ["Rascunho", ""], scheduled: ["Agendado", "badge-on"], publishing: ["Publicando...", "badge-on"],
  published: ["Publicado", "badge-on"], error: ["Erro", ""],
};

// A Meta só aceita JPEG: converte PNG/WebP no navegador
async function toJpeg(file: File): Promise<Blob> {
  if (file.type === "image/jpeg") return file;
  const img = await createImageBitmap(file);
  const c = document.createElement("canvas");
  c.width = img.width; c.height = img.height;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0);
  return new Promise((r) => c.toBlob((b) => r(b!), "image/jpeg", 0.92));
}

// "Comenta CRIATIVO" / Digite "análise" → palavra-chave
function keywordFromCaption(cap: string) {
  const m = cap.match(/(?:comenta|comente|digite|escreve|escreva)\s+["“]?([A-Za-zÀ-ÿ0-9]+)["”]?/i);
  return m?.[1] ?? "";
}

function localInput(d: Date) {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 16);
}

export default function Posts() {
  const sb = supabaseBrowser();
  const [posts, setPosts] = useState<Post[]>([]);
  const [limit, setLimit] = useState<{ ok: boolean; used?: number; total?: number; error?: string } | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [caption, setCaption] = useState("");
  const [when, setWhen] = useState(localInput(new Date(Date.now() + 3600_000)));
  const [keyword, setKeyword] = useState("");
  const [link, setLink] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<Post | null>(null);
  // Reels: capa enviada, ou segundo do vídeo, e se aparece no feed
  const [cover, setCover] = useState("");
  const [offset, setOffset] = useState(0);
  const [toFeed, setToFeed] = useState(true);
  const [targets, setTargets] = useState<string[]>(["instagram"]);
  const [ttOk, setTtOk] = useState(false);
  const toggle = (t: string) => setTargets((x) => x.includes(t) ? x.filter((y) => y !== t) : [...x, t]);
  const ttWarn = targets.includes("tiktok") && items.filter((i) => i.type === "video").length > 1
    ? "O TikTok não aceita carrossel de vídeos: esse post vai falhar lá (no Instagram sai normal)." : "";
  const isReels = items.length === 1 && items[0].type === "video";
  const kindLabel = !items.length ? "" : items.length > 1 ? `Carrossel (${items.length})` : isReels ? "Reels" : "Post de imagem";

  async function uploadCover(f: File) {
    setBusy(true); setMsg("Enviando capa...");
    const { data: u } = await sb.auth.getUser();
    const path = `${u.user!.id}/posts/${Date.now()}-capa.jpg`;
    const { error } = await sb.storage.from("media").upload(path, await toJpeg(f), { contentType: "image/jpeg" });
    if (error) setMsg("Falha: " + error.message);
    else { setCover(sb.storage.from("media").getPublicUrl(path).data.publicUrl); setMsg(""); }
    setBusy(false);
  }

  async function load() {
    const { data } = await sb.from("posts").select("*").order("created_at", { ascending: false }).limit(50);
    setPosts((data as Post[]) ?? []);
  }
  useEffect(() => {
    load();
    fetch("/api/posts/limit").then((r) => r.json()).then(setLimit);
    sb.from("tiktok_accounts").select("user_id").maybeSingle().then(({ data }) => setTtOk(!!data));
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => { const k = keywordFromCaption(caption); if (k && !keyword) setKeyword(k); }, [caption]);

  async function upload(files: FileList) {
    setBusy(true); setMsg("Enviando arquivos...");
    const { data: u } = await sb.auth.getUser();
    const out: Item[] = [];
    for (const f of Array.from(files)) {
      const video = f.type.startsWith("video");
      const body = video ? f : await toJpeg(f);
      const name = f.name.replace(/\.[^.]+$/, "").replace(/[^\w-]/g, "_") + (video ? ".mp4" : ".jpg");
      const path = `${u.user!.id}/posts/${Date.now()}-${name}`;
      const { error } = await sb.storage.from("media").upload(path, body, { contentType: video ? "video/mp4" : "image/jpeg" });
      if (error) { setMsg("Falha: " + error.message); setBusy(false); return; }
      out.push({ url: sb.storage.from("media").getPublicUrl(path).data.publicUrl, type: video ? "video" : "image" });
    }
    setItems((x) => [...x, ...out]);
    setMsg(""); setBusy(false);
  }

  async function create(mode: "draft" | "scheduled" | "now") {
    if (!items.length) return setMsg("Adicione pelo menos uma imagem ou vídeo.");
    if (items.length > 10) return setMsg("Máximo de 10 itens.");
    if (!targets.length) return setMsg("Escolha pelo menos uma rede.");
    if (mode === "now" && !confirm("Publicar agora no Instagram? Isso fica público.")) return;
    const kind = items.length > 1 ? "CAROUSEL" : items[0].type === "video" ? "REELS" : "IMAGE";
    const { data: u } = await sb.auth.getUser();
    const kw = keyword.trim();
    const automation = kw ? {
      name: `${kw.toUpperCase()} · ${caption.split("\n")[0].slice(0, 40)}`,
      keywords: [kw],
      comment_replies: ["Te mandei no direct! 📩", "Enviado! Confere seu direct 😉", "Mandei lá no direct 🚀"],
      welcome_message: `Oi! Vi que você comentou ${kw.toUpperCase()}. Clica no botão abaixo que eu te envio 👇`,
      button_label: "Quero receber",
      steps: link ? [{ type: "link", text: "Aqui está o que eu te prometi 👇", url: link, label: "Abrir" }] : [],
    } : null;
    const final = kind === "REELS"
      ? [{ ...items[0], share_to_feed: toFeed, ...(cover ? { cover } : { thumb_offset: Math.round(offset * 1000) }) }]
      : items;
    const { data, error } = await sb.from("posts").insert({
      user_id: u.user!.id, kind, items: final, caption, targets,
      status: mode === "draft" ? "draft" : "scheduled",
      scheduled_at: mode === "draft" ? null : mode === "now" ? new Date().toISOString() : new Date(when).toISOString(),
      automation,
    }).select("id").single();
    if (error) return setMsg("Erro: " + error.message);
    setItems([]); setCaption(""); setKeyword(""); setLink(""); setCover(""); setOffset(0); setToFeed(true); setTargets(["instagram"]);
    if (mode === "now") { setMsg("Publicando..."); await fetch(`/api/posts/${data.id}/publish-now`, { method: "POST" }); setMsg(""); }
    load();
  }

  async function act(p: Post, a: "now" | "draft" | "delete") {
    if (a === "now") {
      if (!confirm("Publicar agora no Instagram?")) return;
      await fetch(`/api/posts/${p.id}/publish-now`, { method: "POST" });
    } else if (a === "draft") {
      await sb.from("posts").update({ status: "draft" }).eq("id", p.id);
    } else {
      if (!confirm("Apagar este rascunho?")) return;
      await sb.from("posts").delete().eq("id", p.id);
    }
    load();
  }

  return (
    <>
      <h1>Postagens</h1>
      {limit && (limit.ok
        ? <div className="alert alert-ok">Permissão de publicar OK · {limit.used}/{limit.total} posts usados nas últimas 24h</div>
        : <div className="alert alert-err">O token conectado não pode publicar ainda: {limit.error}</div>)}

      <div className="card" style={{ marginBottom: 16 }}>
        <h2>Nova postagem</h2>
        <label>Imagens ou vídeos (1 = post ou Reels, 2 a 10 = carrossel). PNG vira JPEG automaticamente.</label>
        <input type="file" multiple accept="image/*,video/mp4" disabled={busy} onChange={(e) => e.target.files && upload(e.target.files)} />
        {!!items.length && (
          <div className="media-grid" style={{ marginTop: 10 }}>
            {items.map((it, i) => (
              <div key={it.url} className="media-item sel" title="Clique para remover" onClick={() => setItems(items.filter((_, j) => j !== i))}>
                {it.type === "video" ? <video src={it.url} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <img src={it.url} alt="" />}
              </div>
            ))}
          </div>
        )}
        {kindLabel && <p className="muted" style={{ margin: "8px 0 0" }}>Vai sair como: <strong>{kindLabel}</strong></p>}

        {isReels && (
          <div className="step" style={{ marginTop: 12 }}>
            <strong>Capa do Reels</strong>
            <div className="row" style={{ gap: 16, alignItems: "flex-start", marginTop: 8 }}>
              <div style={{ width: 108, aspectRatio: "9/16", background: "#000", borderRadius: 6, overflow: "hidden", flex: "0 0 auto" }}>
                {cover
                  ? <img src={cover} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : <video key={offset} src={`${items[0].url}#t=${offset}`} muted preload="metadata" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
              </div>
              <div style={{ flex: 1, minWidth: 200 }}>
                <label>Enviar uma imagem de capa (1080x1920 de preferência)</label>
                <input type="file" accept="image/*" disabled={busy} onChange={(e) => e.target.files?.[0] && uploadCover(e.target.files[0])} />
                {cover
                  ? <button className="btn btn-sm" style={{ marginTop: 6 }} onClick={() => setCover("")}>Tirar capa e usar um frame do vídeo</button>
                  : <>
                      <label>Ou escolher o frame do vídeo: {offset.toFixed(1)}s</label>
                      <input type="range" min={0} max={60} step={0.5} value={offset} onChange={(e) => setOffset(Number(e.target.value))} />
                    </>}
                <label className="row" style={{ gap: 6, marginTop: 8 }}>
                  <input type="checkbox" checked={toFeed} onChange={(e) => setToFeed(e.target.checked)} style={{ width: "auto" }} />
                  Mostrar também no feed do perfil
                </label>
              </div>
            </div>
          </div>
        )}
        <label>Onde postar</label>
        <div className="row" style={{ gap: 16 }}>
          {[["instagram", "Instagram"], ["tiktok", "TikTok"]].map(([v, l]) => (
            <label key={v} className="row" style={{ gap: 6, margin: 0 }}>
              <input type="checkbox" style={{ width: "auto" }} checked={targets.includes(v)}
                disabled={v === "tiktok" && !ttOk} onChange={() => toggle(v)} />
              {l}{v === "tiktok" && !ttOk && <span className="muted"> (conecte na aba Início)</span>}
            </label>
          ))}
        </div>
        {ttWarn && <div className="alert alert-err" style={{ marginTop: 8 }}>{ttWarn}</div>}
        <label>Legenda</label>
        <textarea value={caption} maxLength={2200} style={{ minHeight: 140 }} onChange={(e) => setCaption(e.target.value)} />
        <div className="grid grid-4">
          <div><label>Palavra do CTA (cria a automação)</label><input value={keyword} placeholder="ex: OFERTA" onChange={(e) => setKeyword(e.target.value)} /></div>
          <div><label>Link do material (opcional)</label><input value={link} placeholder="https://..." onChange={(e) => setLink(e.target.value)} /></div>
          <div><label>Data e hora</label><input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></div>
        </div>
        {msg && <p className="muted">{msg}</p>}
        <div className="row" style={{ marginTop: 14 }}>
          <button className="btn" disabled={busy} onClick={() => create("draft")}>Salvar rascunho</button>
          <button className="btn btn-primary" disabled={busy} onClick={() => create("scheduled")}>Agendar</button>
          <button className="btn" disabled={busy} onClick={() => create("now")}>Publicar agora</button>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table>
          <thead><tr><th></th><th>Legenda</th><th>Redes</th><th>Tipo</th><th>Quando</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {posts.map((p) => (
              <tr key={p.id}>
                <td style={{ width: 56, cursor: "pointer" }} title="Ver cards" onClick={() => setOpen(p)}>{p.items[0] && (p.items[0].type === "video"
                  ? <video src={p.items[0].url} muted width={44} height={55} style={{ objectFit: "cover", borderRadius: 6 }} />
                  : <img src={p.items[0].url} alt="" width={44} height={55} style={{ objectFit: "cover", borderRadius: 6 }} />)}</td>
                <td className="muted" style={{ cursor: "pointer" }} onClick={() => setOpen(p)}>{p.caption.slice(0, 70)}{p.automation?.keywords?.[0] && <div className="chip" style={{ marginTop: 4 }}>CTA: {p.automation.keywords[0]}</div>}</td>
                <td>{(p.targets ?? ["instagram"]).map((t) => (
                  <div key={t} className="chip" style={{ marginBottom: 2 }}>{t === "tiktok" ? `TikTok${p.tiktok?.status ? " · " + ({ processing: "enviando", published: "ok", error: "erro" } as any)[p.tiktok.status] : ""}` : "Instagram"}</div>
                ))}{p.tiktok?.error && <div style={{ color: "var(--err)", fontSize: 12, maxWidth: 220 }}>TikTok: {p.tiktok.error}</div>}</td>
                <td>{p.kind === "CAROUSEL" ? `Carrossel (${p.items.length})` : p.kind === "REELS" ? "Reels" : "Imagem"}</td>
                <td className="muted" style={{ whiteSpace: "nowrap" }}>{(p.published_at || p.scheduled_at) ? new Date(p.published_at || p.scheduled_at!).toLocaleString("pt-BR") : "-"}</td>
                <td>
                  <span className={`badge ${STATUS[p.status]?.[1] ?? ""}`}>{STATUS[p.status]?.[0] ?? p.status}</span>
                  {p.error && <div style={{ color: "var(--err)", fontSize: 12, maxWidth: 260 }}>{p.error}</div>}
                </td>
                <td className="row" style={{ gap: 4 }}>
                  <button className="btn btn-sm" onClick={() => setOpen(p)}>Ver cards</button>
                  {p.permalink && <a className="btn btn-sm" href={p.permalink} target="_blank" rel="noreferrer">Ver post</a>}
                  {["draft", "scheduled", "error"].includes(p.status) && <button className="btn btn-sm" onClick={() => act(p, "now")}>Publicar agora</button>}
                  {p.status === "scheduled" && <button className="btn btn-sm" onClick={() => act(p, "draft")}>Cancelar</button>}
                  {["draft", "error"].includes(p.status) && <button className="btn btn-sm btn-danger" onClick={() => act(p, "delete")}>✕</button>}
                </td>
              </tr>
            ))}
            {!posts.length && <tr><td colSpan={7} className="muted" style={{ textAlign: "center", padding: 30 }}>Nenhuma postagem ainda.</td></tr>}
          </tbody>
        </table>
      </div>
      {open && <PostPreview post={open} onClose={() => setOpen(null)} />}
    </>
  );
}
