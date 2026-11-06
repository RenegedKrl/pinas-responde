"use client";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import PostPreview from "@/components/PostPreview";
import EditPostModal, { Item, Post } from "@/components/EditPostModal";

const STATUS: Record<string, [string, string]> = {
  draft: ["Rascunho", ""],
  scheduled: ["Agendado", "badge-on"],
  publishing: ["Publicando...", "badge-on"],
  published: ["Publicado", "badge-on"],
  error: ["Erro", ""],
};

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

// A Meta só aceita JPEG: converte PNG/WebP no navegador
async function toJpeg(file: File): Promise<Blob> {
  if (file.type === "image/jpeg") return file;
  const img = await createImageBitmap(file);
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, c.width, c.height);
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

// Retorna a segunda-feira 00:00:00 da data informada
function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay(); // 0 = Domingo
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  const mon = new Date(date.setDate(diff));
  mon.setHours(0, 0, 0, 0);
  return mon;
}

// Chave YYYY-MM-DD
function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Intervalo formatado "02/11 a 08/11/2026"
function formatWeekRange(monday: Date): string {
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const pad = (n: number) => String(n).padStart(2, "0");
  const d1 = `${pad(monday.getDate())}/${pad(monday.getMonth() + 1)}`;
  const d2 = `${pad(sunday.getDate())}/${pad(sunday.getMonth() + 1)}/${sunday.getFullYear()}`;
  return `${d1} a ${d2}`;
}

// Formatação amigável de quando vai ser postado
function formatScheduledWhen(isoDateStr: string | null): {
  formatted: string;
  relative: string;
  isNear: boolean;
} {
  if (!isoDateStr) return { formatted: "-", relative: "", isNear: false };
  const d = new Date(isoDateStr);
  const weekday = WEEKDAYS[d.getDay()];
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");

  const now = Date.now();
  const diffMs = d.getTime() - now;
  const diffHours = Math.round(diffMs / 3600_000);
  const diffDays = Math.round(diffMs / 86_400_000);

  let relative = "";
  let isNear = false;

  if (diffMs > 0) {
    if (diffHours <= 1) {
      relative = "em instantes";
      isNear = true;
    } else if (diffHours < 24) {
      relative = `em ${diffHours}h`;
      isNear = true;
    } else if (diffDays === 1) {
      relative = "amanhã";
      isNear = true;
    } else if (diffDays <= 7) {
      relative = `em ${diffDays} dias`;
    } else {
      relative = `em ${diffDays}d`;
    }
  } else {
    if (Math.abs(diffHours) <= 1) {
      relative = "agora há pouco";
    } else if (Math.abs(diffDays) === 1) {
      relative = "ontem";
    } else {
      relative = `há ${Math.abs(diffDays)} dias`;
    }
  }

  return {
    formatted: `${weekday}, ${day}/${month} às ${hours}:${minutes}`,
    relative,
    isNear,
  };
}

const DEFAULT_FIRST_COMMENT =
  "🚀 Gostou do conteúdo? Siga nosso perfil para acompanhar mais análises e dicas práticas! Também atuamos diretamente com gestão de tráfego pago, marketing digital e estratégias de escala para o seu negócio. Se quiser acelerar seus resultados, envie um Direct ou clique no link da bio! 📲";

export default function Posts() {
  const sb = supabaseBrowser();
  const [posts, setPosts] = useState<Post[]>([]);
  const [limit, setLimit] = useState<{ ok: boolean; used?: number; total?: number; error?: string } | null>(null);

  // Form de criação
  const [items, setItems] = useState<Item[]>([]);
  const [caption, setCaption] = useState("");
  const [when, setWhen] = useState(localInput(new Date(Date.now() + 3600_000)));
  const [keyword, setKeyword] = useState("");
  const [link, setLink] = useState("");
  const [firstComment, setFirstComment] = useState(DEFAULT_FIRST_COMMENT);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [cover, setCover] = useState("");
  const [offset, setOffset] = useState(0);
  const [toFeed, setToFeed] = useState(true);
  const [targets, setTargets] = useState<string[]>(["instagram"]);
  const [ttOk, setTtOk] = useState(false);
  const [showForm, setShowForm] = useState(true);

  // Modais
  const [open, setOpen] = useState<Post | null>(null);
  const [editingPost, setEditingPost] = useState<Post | null>(null);

  // Sistema de filtros
  const [weekMode, setWeekMode] = useState<"all" | "week">("all");
  const [currentMonday, setCurrentMonday] = useState<Date>(() => getMonday(new Date()));
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [targetFilter, setTargetFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [sortOrder, setSortOrder] = useState<"chronological" | "created_desc">("chronological");

  const toggleTarget = (t: string) =>
    setTargets((x) => (x.includes(t) ? x.filter((y) => y !== t) : [...x, t]));

  const ttWarn =
    targets.includes("tiktok") && items.filter((i) => i.type === "video").length > 1
      ? "O TikTok não aceita carrossel de vídeos: esse post vai falhar lá (no Instagram sai normal)."
      : "";
  const isReels = items.length === 1 && items[0].type === "video";
  const kindLabel = !items.length
    ? ""
    : items.length > 1
    ? `Carrossel (${items.length})`
    : isReels
    ? "Reels"
    : "Post de imagem";

  async function uploadCover(f: File) {
    setBusy(true);
    setMsg("Enviando capa...");
    const { data: u } = await sb.auth.getUser();
    const path = `${u.user!.id}/posts/${Date.now()}-capa.jpg`;
    const { error } = await sb.storage
      .from("media")
      .upload(path, await toJpeg(f), { contentType: "image/jpeg" });
    if (error) setMsg("Falha: " + error.message);
    else {
      setCover(sb.storage.from("media").getPublicUrl(path).data.publicUrl);
      setMsg("");
    }
    setBusy(false);
  }

  async function load() {
    const { data } = await sb
      .from("posts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    setPosts((data as Post[]) ?? []);
  }

  useEffect(() => {
    load();
    fetch("/api/posts/limit").then((r) => r.json()).then(setLimit);
    sb.from("tiktok_accounts")
      .select("user_id")
      .maybeSingle()
      .then(({ data }) => setTtOk(!!data));
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const k = keywordFromCaption(caption);
    if (k && !keyword) setKeyword(k);
  }, [caption]);

  async function upload(files: FileList) {
    setBusy(true);
    setMsg("Enviando arquivos...");
    const { data: u } = await sb.auth.getUser();
    const out: Item[] = [];
    for (const f of Array.from(files)) {
      const video = f.type.startsWith("video");
      const body = video ? f : await toJpeg(f);
      const name =
        f.name.replace(/\.[^.]+$/, "").replace(/[^\w-]/g, "_") + (video ? ".mp4" : ".jpg");
      const path = `${u.user!.id}/posts/${Date.now()}-${name}`;
      const { error } = await sb.storage
        .from("media")
        .upload(path, body, { contentType: video ? "video/mp4" : "image/jpeg" });
      if (error) {
        setMsg("Falha: " + error.message);
        setBusy(false);
        return;
      }
      out.push({
        url: sb.storage.from("media").getPublicUrl(path).data.publicUrl,
        type: video ? "video" : "image",
      });
    }
    setItems((x) => [...x, ...out]);
    setMsg("");
    setBusy(false);
  }

  async function create(mode: "draft" | "scheduled" | "now") {
    if (!items.length) return setMsg("Adicione pelo menos uma imagem ou vídeo.");
    if (items.length > 10) return setMsg("Máximo de 10 itens.");
    if (!targets.length) return setMsg("Escolha pelo menos uma rede.");
    if (mode === "now" && !confirm("Publicar agora no Instagram? Isso fica público.")) return;

    const kind = items.length > 1 ? "CAROUSEL" : items[0].type === "video" ? "REELS" : "IMAGE";
    const { data: u } = await sb.auth.getUser();
    const kw = keyword.trim();
    const automation = kw
      ? {
          name: `${kw.toUpperCase()} · ${caption.split("\n")[0].slice(0, 40)}`,
          keywords: [kw],
          comment_replies: [
            "Te mandei no direct! 📩",
            "Enviado! Confere seu direct 😉",
            "Mandei lá no direct 🚀",
          ],
          welcome_message: `Oi! Vi que você comentou ${kw.toUpperCase()}. Clica no botão abaixo que eu te envio 👇`,
          button_label: "Quero receber",
          steps: link ? [{ type: "link", text: "Aqui está o que eu te prometi 👇", url: link, label: "Abrir" }] : [],
        }
      : null;

    const final =
      kind === "REELS"
        ? [
            {
              ...items[0],
              share_to_feed: toFeed,
              ...(cover ? { cover } : { thumb_offset: Math.round(offset * 1000) }),
            },
          ]
        : items;

    const { data, error } = await sb
      .from("posts")
      .insert({
        user_id: u.user!.id,
        kind,
        items: final,
        caption,
        targets,
        status: mode === "draft" ? "draft" : "scheduled",
        scheduled_at:
          mode === "draft"
            ? null
            : mode === "now"
            ? new Date().toISOString()
            : new Date(when).toISOString(),
        automation: {
          ...(automation || {}),
          ...(firstComment.trim() ? { first_comment: firstComment.trim() } : {}),
        },
      })
      .select("id")
      .single();

    if (error) return setMsg("Erro: " + error.message);
    setItems([]);
    setCaption("");
    setKeyword("");
    setLink("");
    setFirstComment(DEFAULT_FIRST_COMMENT);
    setCover("");
    setOffset(0);
    setToFeed(true);
    setTargets(["instagram"]);

    if (mode === "now") {
      setMsg("Publicando...");
      await fetch(`/api/posts/${data.id}/publish-now`, { method: "POST" });
      setMsg("");
    }
    load();
  }

  async function act(p: Post, a: "now" | "draft" | "delete") {
    if (a === "now") {
      if (!confirm("Publicar agora no Instagram?")) return;
      await fetch(`/api/posts/${p.id}/publish-now`, { method: "POST" });
    } else if (a === "draft") {
      await sb.from("posts").update({ status: "draft" }).eq("id", p.id);
    } else {
      if (!confirm("Apagar esta postagem?")) return;
      await sb.from("posts").delete().eq("id", p.id);
    }
    load();
  }

  // Detecta todas as semanas que têm postagens agendadas/publicadas
  const availableWeeks = useMemo(() => {
    const map = new Map<string, { monday: Date; count: number }>();
    for (const p of posts) {
      const dt = p.scheduled_at || p.published_at;
      if (!dt) continue;
      const d = new Date(dt);
      const mon = getMonday(d);
      const key = toDateKey(mon);
      if (!map.has(key)) {
        map.set(key, { monday: mon, count: 1 });
      } else {
        map.get(key)!.count++;
      }
    }
    return Array.from(map.values()).sort(
      (a, b) => a.monday.getTime() - b.monday.getTime()
    );
  }, [posts]);

  // Dias da semana atual selecionada (Segunda a Domingo)
  const weekDays = useMemo(() => {
    const days: { date: Date; dateKey: string; weekday: string; count: number; isToday: boolean }[] = [];
    const todayKey = toDateKey(new Date());

    for (let i = 0; i < 7; i++) {
      const d = new Date(currentMonday);
      d.setDate(currentMonday.getDate() + i);
      const k = toDateKey(d);

      // Quantos posts agendados/publicados nesse dia
      const count = posts.filter((p) => {
        const dt = p.scheduled_at || p.published_at;
        if (!dt) return false;
        return toDateKey(new Date(dt)) === k;
      }).length;

      days.push({
        date: d,
        dateKey: k,
        weekday: WEEKDAYS[d.getDay()],
        count,
        isToday: k === todayKey,
      });
    }
    return days;
  }, [currentMonday, posts]);

  // Postagens filtradas
  const filteredPosts = useMemo(() => {
    return posts
      .filter((p) => {
        // Filtro de status
        if (statusFilter !== "all" && p.status !== statusFilter) return false;

        // Filtro de redes
        if (targetFilter !== "all") {
          const t = p.targets ?? ["instagram"];
          if (!t.includes(targetFilter)) return false;
        }

        // Filtro de busca de texto
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const capMatch = p.caption?.toLowerCase().includes(q);
          const kwMatch = p.automation?.keywords?.some((k: string) =>
            k.toLowerCase().includes(q)
          );
          if (!capMatch && !kwMatch) return false;
        }

        // Filtro de semana
        if (weekMode === "week") {
          const dt = p.scheduled_at || p.published_at;
          if (!dt) return false; // rascunhos sem data não aparecem no filtro de semana específica
          const postDate = new Date(dt);
          const postMon = getMonday(postDate);
          if (toDateKey(postMon) !== toDateKey(currentMonday)) return false;

          // Filtro por dia específico dentro da semana
          if (selectedDay) {
            if (toDateKey(postDate) !== selectedDay) return false;
          }
        }

        return true;
      })
      .sort((a, b) => {
        if (sortOrder === "chronological") {
          const timeA =
            a.scheduled_at || a.published_at
              ? new Date(a.scheduled_at || a.published_at!).getTime()
              : Infinity;
          const timeB =
            b.scheduled_at || b.published_at
              ? new Date(b.scheduled_at || b.published_at!).getTime()
              : Infinity;
          return timeA - timeB;
        }
        return 0; // ordem padrão por created_at desc
      });
  }, [
    posts,
    statusFilter,
    targetFilter,
    searchQuery,
    weekMode,
    currentMonday,
    selectedDay,
    sortOrder,
  ]);

  // Contagem de agendamentos na semana selecionada
  const scheduledCountInWeek = useMemo(() => {
    return posts.filter((p) => {
      if (p.status !== "scheduled") return false;
      const dt = p.scheduled_at;
      if (!dt) return false;
      return toDateKey(getMonday(new Date(dt))) === toDateKey(currentMonday);
    }).length;
  }, [posts, currentMonday]);

  return (
    <>
      <div
        className="row"
        style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}
      >
        <div>
          <h1 style={{ margin: 0 }}>Postagens</h1>
          <p className="muted" style={{ margin: "4px 0 0", fontSize: 14 }}>
            Gerencie, filtre por semana e edite agendamentos de todas as suas postagens.
          </p>
        </div>

        <button
          className="btn"
          onClick={() => setShowForm(!showForm)}
          style={{ whiteSpace: "nowrap" }}
        >
          {showForm ? "− Ocultar Nova Postagem" : "+ Nova Postagem"}
        </button>
      </div>

      {limit && (
        limit.ok ? (
          <div className="alert alert-ok">
            Permissão de publicar OK · {limit.used}/{limit.total} posts usados nas últimas 24h
          </div>
        ) : (
          <div className="alert alert-err">
            O token conectado não pode publicar ainda: {limit.error}
          </div>
        )
      )}

      {/* Card Nova Postagem (Responsivo e retrátil) */}
      {showForm && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
            <h2 style={{ margin: 0 }}>Criar Nova Postagem</h2>
            {kindLabel && (
              <span className="badge badge-on" style={{ fontSize: 13 }}>
                Vai sair como: {kindLabel}
              </span>
            )}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
              gap: 20,
            }}
          >
            {/* Coluna 1: Arquivos e Capa */}
            <div>
              <label style={{ margin: "0 0 6px" }}>
                Imagens ou vídeos (1 = post ou Reels, 2 a 10 = carrossel). PNG vira JPEG automaticamente.
              </label>
              <input
                type="file"
                multiple
                accept="image/*,video/mp4"
                disabled={busy}
                onChange={(e) => e.target.files && upload(e.target.files)}
              />

              {!!items.length && (
                <div className="media-grid" style={{ marginTop: 12 }}>
                  {items.map((it, i) => (
                    <div
                      key={it.url}
                      className="media-item sel"
                      title="Clique para remover"
                      onClick={() => setItems(items.filter((_, j) => j !== i))}
                    >
                      {it.type === "video" ? (
                        <video
                          src={it.url}
                          muted
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      ) : (
                        <img src={it.url} alt="" />
                      )}
                      <div
                        style={{
                          position: "absolute",
                          bottom: 4,
                          left: 4,
                          background: "rgba(0,0,0,0.7)",
                          color: "#fff",
                          fontSize: 10,
                          padding: "1px 5px",
                          borderRadius: 3,
                        }}
                      >
                        {i === 0 ? "Capa" : `#${i + 1}`}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {isReels && (
                <div className="step" style={{ marginTop: 14 }}>
                  <strong>Capa do Reels</strong>
                  <div className="row" style={{ gap: 14, alignItems: "flex-start", marginTop: 8 }}>
                    <div
                      style={{
                        width: 90,
                        aspectRatio: "9/16",
                        background: "#000",
                        borderRadius: 6,
                        overflow: "hidden",
                        flex: "0 0 auto",
                      }}
                    >
                      {cover ? (
                        <img
                          src={cover}
                          alt=""
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      ) : (
                        <video
                          key={offset}
                          src={`${items[0].url}#t=${offset}`}
                          muted
                          preload="metadata"
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <label style={{ margin: "0 0 6px" }}>Imagem de capa (1080x1920)</label>
                      <input
                        type="file"
                        accept="image/*"
                        disabled={busy}
                        onChange={(e) =>
                          e.target.files?.[0] && uploadCover(e.target.files[0])
                        }
                      />
                      {cover ? (
                        <button
                          type="button"
                          className="btn btn-sm"
                          style={{ marginTop: 6 }}
                          onClick={() => setCover("")}
                        >
                          Usar frame do vídeo
                        </button>
                      ) : (
                        <>
                          <label style={{ margin: "8px 0 4px" }}>
                            Frame do vídeo: {offset.toFixed(1)}s
                          </label>
                          <input
                            type="range"
                            min={0}
                            max={60}
                            step={0.5}
                            value={offset}
                            onChange={(e) => setOffset(Number(e.target.value))}
                          />
                        </>
                      )}
                      <label className="row" style={{ gap: 6, marginTop: 8, cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={toFeed}
                          onChange={(e) => setToFeed(e.target.checked)}
                          style={{ width: "auto" }}
                        />
                        <span>Mostrar também no feed</span>
                      </label>
                    </div>
                  </div>
                </div>
              )}

              <div style={{ marginTop: 14 }}>
                <label style={{ margin: "0 0 6px", fontWeight: 600 }}>Onde postar</label>
                <div className="row" style={{ gap: 16 }}>
                  {[
                    ["instagram", "Instagram"],
                    ["tiktok", "TikTok"],
                  ].map(([v, l]) => (
                    <label key={v} className="row" style={{ gap: 6, margin: 0, cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        style={{ width: "auto" }}
                        checked={targets.includes(v)}
                        disabled={v === "tiktok" && !ttOk}
                        onChange={() => toggleTarget(v)}
                      />
                      <span>
                        {l}
                        {v === "tiktok" && !ttOk && (
                          <span className="muted" style={{ fontSize: 12 }}> (conecte na aba Início)</span>
                        )}
                      </span>
                    </label>
                  ))}
                </div>
                {ttWarn && <div className="alert alert-err" style={{ marginTop: 8 }}>{ttWarn}</div>}
              </div>
            </div>

            {/* Coluna 2: Legenda, CTA e Agendamento */}
            <div>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <label style={{ margin: "0 0 6px", fontWeight: 600 }}>Legenda</label>
                <span className="muted" style={{ fontSize: 12 }}>{caption.length}/2200</span>
              </div>
              <textarea
                value={caption}
                maxLength={2200}
                style={{ minHeight: 120 }}
                placeholder="Legenda da postagem..."
                onChange={(e) => setCaption(e.target.value)}
              />

              <div style={{ marginTop: 12 }}>
                <label style={{ margin: "0 0 4px", display: "flex", justifyContent: "space-between" }}>
                  <span>💬 Primeiro comentário automático (Fixar / Merchandising)</span>
                  <span className="muted" style={{ fontSize: 11 }}>Publicado logo após o post ir ao ar</span>
                </label>
                <textarea
                  rows={3}
                  value={firstComment}
                  placeholder="Deixe em branco se não quiser comentar automaticamente..."
                  onChange={(e) => setFirstComment(e.target.value)}
                  style={{ width: "100%", fontSize: 13, resize: "vertical" }}
                />
              </div>

              <div className="grid grid-4" style={{ marginTop: 10 }}>
                <div>
                  <label style={{ margin: "0 0 4px" }}>Palavra do CTA</label>
                  <input
                    value={keyword}
                    placeholder="ex: OFERTA"
                    onChange={(e) => setKeyword(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ margin: "0 0 4px" }}>Link do material (opcional)</label>
                  <input
                    value={link}
                    placeholder="https://..."
                    onChange={(e) => setLink(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ margin: "0 0 4px" }}>Data e hora de agendamento</label>
                  <input
                    type="datetime-local"
                    value={when}
                    onChange={(e) => setWhen(e.target.value)}
                  />
                </div>
              </div>

              {msg && <p className="muted" style={{ marginTop: 10 }}>{msg}</p>}

              <div className="row" style={{ marginTop: 16 }}>
                <button className="btn" disabled={busy} onClick={() => create("draft")}>
                  Salvar rascunho
                </button>
                <button
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={() => create("scheduled")}
                >
                  Agendar postagem
                </button>
                <button className="btn" disabled={busy} onClick={() => create("now")}>
                  Publicar agora
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Barra de Filtros e Navegação por Semana */}
      <div className="filter-bar">
        {/* Linha superior: Modo de visualização de semana e busca */}
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <div className="row" style={{ gap: 8 }}>
            <button
              className={`btn btn-sm ${weekMode === "all" ? "btn-primary" : ""}`}
              onClick={() => {
                setWeekMode("all");
                setSelectedDay(null);
              }}
            >
              📋 Ver todas as postagens
            </button>
            <button
              className={`btn btn-sm ${weekMode === "week" ? "btn-primary" : ""}`}
              onClick={() => {
                setWeekMode("week");
                setSelectedDay(null);
              }}
            >
              📅 Filtrar por semana
            </button>
          </div>

          <div className="row" style={{ gap: 8, flex: 1, maxWidth: 360 }}>
            <input
              type="text"
              placeholder="🔍 Buscar na legenda ou CTA..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ padding: "6px 12px", fontSize: 13 }}
            />
            {searchQuery && (
              <button
                className="btn btn-sm"
                onClick={() => setSearchQuery("")}
                title="Limpar busca"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Linha da semana: Navegador e Seleção */}
        {weekMode === "week" && (
          <div
            style={{
              background: "var(--bg)",
              padding: 14,
              borderRadius: 12,
              border: "1px solid var(--line)",
            }}
          >
            <div
              className="row"
              style={{
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 12,
              }}
            >
              <div className="row" style={{ gap: 8, alignItems: "center" }}>
                <button
                  className="btn btn-sm"
                  onClick={() => {
                    const prev = new Date(currentMonday);
                    prev.setDate(prev.getDate() - 7);
                    setCurrentMonday(prev);
                    setSelectedDay(null);
                  }}
                  title="Semana anterior"
                >
                  ‹ Semana anterior
                </button>

                <strong style={{ fontSize: 15 }}>
                  📅 Semana de {formatWeekRange(currentMonday)}
                </strong>

                <button
                  className="btn btn-sm"
                  onClick={() => {
                    const next = new Date(currentMonday);
                    next.setDate(next.getDate() + 7);
                    setCurrentMonday(next);
                    setSelectedDay(null);
                  }}
                  title="Próxima semana"
                >
                  Próxima semana ›
                </button>

                <button
                  className="btn btn-sm"
                  onClick={() => {
                    setCurrentMonday(getMonday(new Date()));
                    setSelectedDay(null);
                  }}
                >
                  Semana atual (Hoje)
                </button>
              </div>

              {/* Atalho para semanas que já contêm posts agendados */}
              <div className="row" style={{ gap: 8, alignItems: "center" }}>
                {availableWeeks.length > 0 && (
                  <select
                    style={{ width: "auto", padding: "6px 10px", fontSize: 13 }}
                    value={toDateKey(currentMonday)}
                    onChange={(e) => {
                      const found = availableWeeks.find(
                        (w) => toDateKey(w.monday) === e.target.value
                      );
                      if (found) {
                        setCurrentMonday(new Date(found.monday));
                        setSelectedDay(null);
                      }
                    }}
                  >
                    <option value="" disabled>
                      Pular para semana com posts ({availableWeeks.length})
                    </option>
                    {availableWeeks.map((w) => (
                      <option key={toDateKey(w.monday)} value={toDateKey(w.monday)}>
                        Semana de {formatWeekRange(w.monday)} ({w.count} post{w.count > 1 ? "s" : ""})
                      </option>
                    ))}
                  </select>
                )}

                <input
                  type="date"
                  title="Escolher qualquer data para ir até a semana correspondente"
                  style={{ width: "auto", padding: "6px 10px", fontSize: 13 }}
                  onChange={(e) => {
                    if (e.target.value) {
                      const [y, m, d] = e.target.value.split("-").map(Number);
                      const target = new Date(y, m - 1, d);
                      setCurrentMonday(getMonday(target));
                      setSelectedDay(toDateKey(target));
                    }
                  }}
                />
              </div>
            </div>

            {/* Fita de 7 dias da semana (Segunda a Domingo) */}
            <div className="week-strip">
              {weekDays.map((d) => {
                const isSelected = selectedDay === d.dateKey;
                return (
                  <div
                    key={d.dateKey}
                    className={`day-card ${isSelected ? "active" : ""} ${d.isToday ? "today" : ""}`}
                    onClick={() => {
                      if (selectedDay === d.dateKey) {
                        setSelectedDay(null); // Desmarca para ver a semana inteira
                      } else {
                        setSelectedDay(d.dateKey);
                      }
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>
                      {d.weekday}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 800, margin: "2px 0" }}>
                      {String(d.date.getDate()).padStart(2, "0")}/{String(d.date.getMonth() + 1).padStart(2, "0")}
                    </div>
                    <div style={{ fontSize: 11 }}>
                      {d.count > 0 ? (
                        <span className="badge badge-on" style={{ padding: "1px 7px" }}>
                          {d.count} post{d.count > 1 ? "s" : ""}
                        </span>
                      ) : (
                        <span className="muted">-</span>
                      )}
                    </div>
                    {d.isToday && (
                      <div style={{ fontSize: 10, color: "var(--brand-2)", fontWeight: 700, marginTop: 2 }}>
                        Hoje
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {selectedDay && (
              <div
                className="row"
                style={{
                  justifyContent: "space-between",
                  marginTop: 10,
                  fontSize: 13,
                  color: "var(--brand)",
                }}
              >
                <span>
                  Filtrando pelo dia: <strong>{selectedDay.split("-").reverse().join("/")}</strong>
                </span>
                <button
                  className="btn btn-sm"
                  onClick={() => setSelectedDay(null)}
                >
                  ✕ Ver todos os dias da semana
                </button>
              </div>
            )}
          </div>
        )}

        {/* Linha de filtros secundários: Status, Redes e Ordenação */}
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <div className="row" style={{ gap: 14, alignItems: "center" }}>
            <div className="row" style={{ gap: 6, alignItems: "center" }}>
              <span className="muted" style={{ fontSize: 13 }}>Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={{ width: "auto", padding: "5px 10px", fontSize: 13 }}
              >
                <option value="all">Todos os status</option>
                <option value="scheduled">Agendados</option>
                <option value="draft">Rascunhos</option>
                <option value="published">Publicados</option>
                <option value="error">Erros</option>
              </select>
            </div>

            <div className="row" style={{ gap: 6, alignItems: "center" }}>
              <span className="muted" style={{ fontSize: 13 }}>Redes:</span>
              <select
                value={targetFilter}
                onChange={(e) => setTargetFilter(e.target.value)}
                style={{ width: "auto", padding: "5px 10px", fontSize: 13 }}
              >
                <option value="all">Todas as redes</option>
                <option value="instagram">Instagram</option>
                <option value="tiktok">TikTok</option>
              </select>
            </div>

            <div className="row" style={{ gap: 6, alignItems: "center" }}>
              <span className="muted" style={{ fontSize: 13 }}>Ordem:</span>
              <select
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as any)}
                style={{ width: "auto", padding: "5px 10px", fontSize: 13 }}
              >
                <option value="chronological">Próximos a postar primeiro</option>
                <option value="created_desc">Mais recentes criados</option>
              </select>
            </div>
          </div>

          <div className="muted" style={{ fontSize: 13 }}>
            Mostrando <strong>{filteredPosts.length}</strong> de <strong>{posts.length}</strong> postagens
            {weekMode === "week" && (
              <> · <strong>{scheduledCountInWeek}</strong> agendadas nesta semana</>
            )}
          </div>
        </div>
      </div>

      {/* Tabela de Postagens com layout amplo e responsivo */}
      <div className="table-container">
        <table className="table-clean">
          <thead>
            <tr>
              <th style={{ width: 68 }}>Mídia</th>
              <th>Legenda & CTA</th>
              <th style={{ width: 120 }}>Redes</th>
              <th style={{ width: 110 }}>Tipo</th>
              <th style={{ width: 200 }}>Quando vai ser postado</th>
              <th style={{ width: 110 }}>Status</th>
              <th style={{ width: 280, textAlign: "right" }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {filteredPosts.map((p) => {
              const whenInfo = formatScheduledWhen(p.published_at || p.scheduled_at);
              const isEditable = ["draft", "scheduled", "error"].includes(p.status);

              return (
                <tr key={p.id}>
                  {/* Thumbnail / Mídia */}
                  <td>
                    <div
                      style={{
                        position: "relative",
                        width: 52,
                        aspectRatio: "4/5",
                        borderRadius: 8,
                        overflow: "hidden",
                        background: "#000",
                        cursor: "pointer",
                        border: "1px solid var(--line)",
                      }}
                      title="Clique para ver cards e detalhes"
                      onClick={() => setOpen(p)}
                    >
                      {p.items[0] &&
                        (p.items[0].type === "video" ? (
                          <video
                            src={p.items[0].url}
                            muted
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          />
                        ) : (
                          <img
                            src={p.items[0].url}
                            alt=""
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          />
                        ))}
                      {p.items.length > 1 && (
                        <div
                          style={{
                            position: "absolute",
                            bottom: 2,
                            right: 2,
                            background: "rgba(0,0,0,0.8)",
                            color: "#fff",
                            fontSize: 9,
                            fontWeight: 700,
                            padding: "1px 4px",
                            borderRadius: 3,
                          }}
                        >
                          +{p.items.length - 1}
                        </div>
                      )}
                    </div>
                  </td>

                  {/* Legenda & Palavra-chave */}
                  <td>
                    <div
                      style={{
                        fontSize: 14,
                        lineHeight: 1.4,
                        cursor: "pointer",
                        maxWidth: 480,
                      }}
                      onClick={() => setOpen(p)}
                    >
                      <span title={p.caption}>
                        {p.caption.length > 130
                          ? p.caption.slice(0, 130) + "..."
                          : p.caption || <span className="muted">(sem legenda)</span>}
                      </span>
                    </div>

                    {p.automation?.keywords?.[0] && (
                      <div className="row" style={{ gap: 6, marginTop: 4 }}>
                        <span className="chip" style={{ fontSize: 12, padding: "2px 8px" }}>
                          💬 CTA: <strong>{p.automation.keywords[0]}</strong>
                        </span>
                        {p.automation?.steps?.find((s: any) => s.type === "link")?.url && (
                          <span className="chip" style={{ fontSize: 11, padding: "2px 8px" }}>
                            🔗 Link configurado
                          </span>
                        )}
                      </div>
                    )}
                  </td>

                  {/* Redes */}
                  <td>
                    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                      {(p.targets ?? ["instagram"]).map((t) => (
                        <span
                          key={t}
                          className="chip"
                          style={{
                            fontSize: 12,
                            padding: "2px 8px",
                            display: "inline-flex",
                            alignItems: "center",
                          }}
                        >
                          {t === "tiktok" ? (
                            <>
                              TikTok
                              {p.tiktok?.status && (
                                <span className="muted" style={{ marginLeft: 4 }}>
                                  ·{" "}
                                  {(
                                    {
                                      processing: "enviando",
                                      published: "ok",
                                      error: "erro",
                                    } as any
                                  )[p.tiktok.status] || p.tiktok.status}
                                </span>
                              )}
                            </>
                          ) : (
                            "Instagram"
                          )}
                        </span>
                      ))}
                      {p.tiktok?.error && (
                        <div style={{ color: "var(--err)", fontSize: 11, maxWidth: 160 }}>
                          TikTok: {p.tiktok.error}
                        </div>
                      )}
                    </div>
                  </td>

                  {/* Tipo */}
                  <td>
                    <span className="chip" style={{ fontSize: 12, fontWeight: 600 }}>
                      {p.kind === "CAROUSEL"
                        ? `Carrossel (${p.items.length})`
                        : p.kind === "REELS"
                        ? "Reels"
                        : "Imagem"}
                    </span>
                  </td>

                  {/* Quando vai ser postado */}
                  <td>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>
                      {whenInfo.formatted}
                    </div>
                    {whenInfo.relative && (
                      <div style={{ marginTop: 2 }}>
                        <span
                          className={`badge ${whenInfo.isNear ? "badge-on" : ""}`}
                          style={{
                            fontSize: 11,
                            padding: "1px 6px",
                            fontWeight: 600,
                          }}
                        >
                          {whenInfo.relative}
                        </span>
                      </div>
                    )}
                  </td>

                  {/* Status */}
                  <td>
                    <span className={`badge ${STATUS[p.status]?.[1] ?? ""}`}>
                      {STATUS[p.status]?.[0] ?? p.status}
                    </span>
                    {p.error && (
                      <div
                        style={{
                          color: "var(--err)",
                          fontSize: 11,
                          marginTop: 4,
                          maxWidth: 200,
                          wordBreak: "break-word",
                        }}
                      >
                        {p.error}
                      </div>
                    )}
                  </td>

                  {/* Ações */}
                  <td style={{ textAlign: "right" }}>
                    <div
                      className="row"
                      style={{
                        gap: 6,
                        justifyContent: "flex-end",
                        flexWrap: "nowrap",
                      }}
                    >
                      {/* Botão de Editar */}
                      {isEditable && (
                        <button
                          className="btn btn-sm"
                          style={{
                            borderColor: "var(--brand)",
                            color: "var(--brand)",
                            fontWeight: 700,
                          }}
                          title="Editar legenda, mídias, capa, redes ou data"
                          onClick={() => setEditingPost(p)}
                        >
                          ✏️ Editar
                        </button>
                      )}

                      <button
                        className="btn btn-sm"
                        onClick={() => setOpen(p)}
                        title="Visualizar prévia e cards"
                      >
                        Ver cards
                      </button>

                      {p.permalink && (
                        <a
                          className="btn btn-sm"
                          href={p.permalink}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Ver post
                        </a>
                      )}

                      {isEditable && (
                        <button
                          className="btn btn-sm"
                          onClick={() => act(p, "now")}
                          title="Publicar imediatamente"
                        >
                          Publicar agora
                        </button>
                      )}

                      {p.status === "scheduled" && (
                        <button
                          className="btn btn-sm"
                          onClick={() => act(p, "draft")}
                          title="Cancelar agendamento e voltar para rascunho"
                        >
                          Cancelar
                        </button>
                      )}

                      {["draft", "error"].includes(p.status) && (
                        <button
                          className="btn btn-sm btn-danger"
                          onClick={() => act(p, "delete")}
                          title="Excluir postagem"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}

            {!filteredPosts.length && (
              <tr>
                <td colSpan={7} className="muted" style={{ textAlign: "center", padding: 36 }}>
                  {weekMode === "week"
                    ? `Nenhuma postagem agendada para a semana de ${formatWeekRange(currentMonday)} com os filtros atuais.`
                    : "Nenhuma postagem encontrada com os filtros selecionados."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal de Prévia dos Cards */}
      {open && (
        <PostPreview
          post={open}
          onClose={() => setOpen(null)}
          onEdit={() => {
            const p = open;
            setOpen(null);
            setEditingPost(p);
          }}
        />
      )}

      {/* Modal de Edição Completa da Postagem */}
      {editingPost && (
        <EditPostModal
          post={editingPost}
          ttOk={ttOk}
          onClose={() => setEditingPost(null)}
          onSaved={load}
        />
      )}
    </>
  );
}
