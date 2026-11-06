"use client";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";

export interface Item {
  url: string;
  type: "image" | "video";
  cover?: string;
  thumb_offset?: number;
  share_to_feed?: boolean;
}

export interface Post {
  id: string;
  kind: string;
  items: Item[];
  caption: string;
  scheduled_at: string | null;
  status: string;
  permalink: string | null;
  targets?: string[];
  tiktok?: { status?: string; error?: string };
  error: string | null;
  automation: any;
  published_at: string | null;
}

interface EditPostModalProps {
  post: Post;
  ttOk: boolean;
  onClose: () => void;
  onSaved: () => void;
}

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

function localInput(d: Date) {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 16);
}

export default function EditPostModal({ post, ttOk, onClose, onSaved }: EditPostModalProps) {
  const sb = supabaseBrowser();
  const [items, setItems] = useState<Item[]>(post.items ?? []);
  const [caption, setCaption] = useState(post.caption ?? "");
  const [targets, setTargets] = useState<string[]>(post.targets ?? ["instagram"]);
  const [mode, setMode] = useState<"scheduled" | "draft">(
    post.status === "draft" ? "draft" : "scheduled"
  );
  const [when, setWhen] = useState(
    localInput(post.scheduled_at ? new Date(post.scheduled_at) : new Date(Date.now() + 3600_000))
  );

  // CTA automation fields
  const initialKeyword = post.automation?.keywords?.[0] ?? "";
  const initialLink = post.automation?.steps?.find((s: any) => s.type === "link")?.url ?? "";
  const [keyword, setKeyword] = useState(initialKeyword);
  const [link, setLink] = useState(initialLink);
  const initialFirstComment =
    post.automation?.first_comment ??
    "🚀 Gostou do conteúdo? Siga nosso perfil para acompanhar mais análises e dicas práticas! Também atuamos diretamente com gestão de tráfego pago, marketing digital e estratégias de escala para o seu negócio. Se quiser acelerar seus resultados, envie um Direct ou clique no link da bio! 📲";
  const [firstComment, setFirstComment] = useState(initialFirstComment);

  // Reels cover & offset
  const firstItem = post.items?.[0];
  const [cover, setCover] = useState<string>(firstItem?.cover ?? "");
  const [offset, setOffset] = useState<number>(
    firstItem?.thumb_offset != null ? firstItem.thumb_offset / 1000 : 0
  );
  const [toFeed, setToFeed] = useState<boolean>(firstItem?.share_to_feed !== false);

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const toggleTarget = (t: string) => {
    setTargets((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));
  };

  const isReels = items.length === 1 && items[0]?.type === "video";
  const kindLabel = !items.length
    ? ""
    : items.length > 1
    ? `Carrossel (${items.length} itens)`
    : isReels
    ? "Reels (Vídeo)"
    : "Post de Imagem";

  const ttWarn =
    targets.includes("tiktok") && items.filter((i) => i.type === "video").length > 1
      ? "O TikTok não aceita carrossel de vídeos: esse post falhará no TikTok (mas sairá normal no Instagram)."
      : "";

  // Move item left in carousel
  function moveItem(index: number, direction: -1 | 1) {
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= items.length) return;
    const copy = [...items];
    const temp = copy[index];
    copy[index] = copy[targetIdx];
    copy[targetIdx] = temp;
    setItems(copy);
  }

  // Remove item
  function removeItem(index: number) {
    if (items.length <= 1) {
      if (!confirm("Remover esta mídia deixará o post sem arquivos. Deseja continuar?")) return;
    }
    setItems(items.filter((_, i) => i !== index));
  }

  // Upload custom cover for Reels
  async function uploadCover(f: File) {
    setBusy(true);
    setMsg("Enviando capa do Reels...");
    try {
      const { data: u } = await sb.auth.getUser();
      const path = `${u.user!.id}/posts/${Date.now()}-capa.jpg`;
      const { error } = await sb.storage
        .from("media")
        .upload(path, await toJpeg(f), { contentType: "image/jpeg" });
      if (error) {
        setMsg("Falha ao enviar capa: " + error.message);
      } else {
        setCover(sb.storage.from("media").getPublicUrl(path).data.publicUrl);
        setMsg("");
      }
    } catch (e: any) {
      setMsg("Erro no upload: " + (e.message || String(e)));
    } finally {
      setBusy(false);
    }
  }

  // Upload new images/videos
  async function uploadNewMedia(files: FileList) {
    setBusy(true);
    setMsg("Enviando novas mídias...");
    try {
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
          setMsg("Falha no upload: " + error.message);
          setBusy(false);
          return;
        }
        out.push({
          url: sb.storage.from("media").getPublicUrl(path).data.publicUrl,
          type: video ? "video" : "image",
        });
      }
      setItems((prev) => [...prev, ...out]);
      setMsg("");
    } catch (e: any) {
      setMsg("Erro no upload: " + (e.message || String(e)));
    } finally {
      setBusy(false);
    }
  }

  // Save changes
  async function saveChanges(publishNow = false) {
    if (!items.length) {
      setMsg("Adicione pelo menos uma imagem ou vídeo para a postagem.");
      return;
    }
    if (items.length > 10) {
      setMsg("Máximo de 10 mídias por postagem.");
      return;
    }
    if (!targets.length) {
      setMsg("Escolha pelo menos uma rede social para postar.");
      return;
    }

    if (publishNow && !confirm("Deseja salvar e publicar agora no Instagram? Isso ficará público imediatamente.")) {
      return;
    }

    setBusy(true);
    setMsg("Salvando alterações do agendamento...");

    try {
      const kind =
        items.length > 1 ? "CAROUSEL" : items[0].type === "video" ? "REELS" : "IMAGE";

      const finalItems =
        kind === "REELS"
          ? [
              {
                ...items[0],
                share_to_feed: toFeed,
                ...(cover ? { cover } : { thumb_offset: Math.round(offset * 1000) }),
              },
            ]
          : items;

      const kw = keyword.trim();
      const automation = kw
        ? {
            name: `${kw.toUpperCase()} · ${caption.split("\n")[0].slice(0, 40)}`,
            keywords: [kw],
            comment_replies: post.automation?.comment_replies ?? [
              "Te mandei no direct! 📩",
              "Enviado! Confere seu direct 😉",
              "Mandei lá no direct 🚀",
            ],
            welcome_message:
              post.automation?.welcome_message ??
              `Oi! Vi que você comentou ${kw.toUpperCase()}. Clica no botão abaixo que eu te envio 👇`,
            button_label: post.automation?.button_label ?? "Quero receber",
            steps: link ? [{ type: "link", text: "Aqui está o que eu te prometi 👇", url: link, label: "Abrir" }] : [],
          }
        : null;

      const newStatus = publishNow ? "publishing" : mode;
      const scheduledDate =
        newStatus === "draft"
          ? null
          : publishNow
          ? new Date().toISOString()
          : new Date(when).toISOString();

      const patch: any = {
        kind,
        items: finalItems,
        caption,
        targets,
        status: newStatus,
        scheduled_at: scheduledDate,
        automation: {
          ...(automation || {}),
          ...(firstComment.trim() ? { first_comment: firstComment.trim() } : {}),
          ...(post.automation?.first_comment_id ? { first_comment_id: post.automation.first_comment_id } : {}),
        },
        containers: {}, // reset containers to force fresh publication containers
        error: null,
        updated_at: new Date().toISOString(),
      };

      const { error: updateError } = await sb.from("posts").update(patch).eq("id", post.id);
      if (updateError) {
        setMsg("Erro ao salvar: " + updateError.message);
        setBusy(false);
        return;
      }

      if (publishNow) {
        setMsg("Disparando publicação imediata...");
        await fetch(`/api/posts/${post.id}/publish-now`, { method: "POST" });
      }

      setMsg("");
      setBusy(false);
      onSaved();
      onClose();
    } catch (err: any) {
      setMsg("Erro ao atualizar: " + (err.message || String(err)));
      setBusy(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.78)",
        backdropFilter: "blur(4px)",
        zIndex: 60,
        overflowY: "auto",
        padding: "20px 14px",
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card"
        style={{
          width: "100%",
          maxWidth: 820,
          margin: "20px auto",
          padding: 24,
          maxHeight: "92vh",
          overflowY: "auto",
          boxShadow: "0 20px 50px rgba(0,0,0,0.5)",
          borderRadius: 16,
        }}
      >
        {/* Header */}
        <div
          className="row"
          style={{
            justifyContent: "space-between",
            paddingBottom: 14,
            borderBottom: "1px solid var(--line)",
            marginBottom: 18,
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: 19 }}>✏️ Editar Agendamento</h2>
            <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
              Altere legendas, capa, mídias, redes e data de publicação
            </div>
          </div>
          <button className="btn btn-sm" onClick={onClose} disabled={busy}>
            ✕ Fechar
          </button>
        </div>

        {/* Section 1: Midias / Cards */}
        <div style={{ marginBottom: 20 }}>
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
            <strong>Mídias da postagem ({items.length}/10)</strong>
            {kindLabel && <span className="chip" style={{ fontWeight: 600 }}>{kindLabel}</span>}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
              gap: 10,
              marginBottom: 10,
            }}
          >
            {items.map((it, idx) => (
              <div
                key={it.url + idx}
                style={{
                  position: "relative",
                  borderRadius: 10,
                  overflow: "hidden",
                  border: `2px solid ${idx === 0 ? "var(--brand)" : "var(--line)"}`,
                  background: "#000",
                  aspectRatio: "4/5",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                }}
              >
                {/* Media view */}
                {it.type === "video" ? (
                  <video
                    src={it.url}
                    muted
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : (
                  <img
                    src={it.url}
                    alt=""
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                )}

                {/* Badge item number */}
                <div
                  style={{
                    position: "absolute",
                    top: 6,
                    left: 6,
                    background: "rgba(0,0,0,0.75)",
                    color: "#fff",
                    fontSize: 11,
                    padding: "2px 6px",
                    borderRadius: 4,
                    fontWeight: 700,
                  }}
                >
                  {idx === 0 ? "★ Capa" : `#${idx + 1}`}
                </div>

                {/* Delete button */}
                <button
                  type="button"
                  title="Remover mídia"
                  onClick={() => removeItem(idx)}
                  disabled={busy}
                  style={{
                    position: "absolute",
                    top: 6,
                    right: 6,
                    background: "rgba(220, 38, 38, 0.85)",
                    color: "#fff",
                    border: 0,
                    width: 24,
                    height: 24,
                    borderRadius: 99,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    fontWeight: "bold",
                  }}
                >
                  ✕
                </button>

                {/* Reorder buttons if carousel */}
                {items.length > 1 && (
                  <div
                    style={{
                      position: "absolute",
                      bottom: 6,
                      left: 6,
                      right: 6,
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 4,
                    }}
                  >
                    <button
                      type="button"
                      disabled={busy || idx === 0}
                      onClick={() => moveItem(idx, -1)}
                      style={{
                        background: "rgba(0,0,0,0.8)",
                        color: "#fff",
                        border: 0,
                        padding: "3px 8px",
                        borderRadius: 4,
                        fontSize: 12,
                        cursor: idx === 0 ? "default" : "pointer",
                        opacity: idx === 0 ? 0.4 : 1,
                      }}
                      title="Mover para esquerda"
                    >
                      ‹
                    </button>
                    <button
                      type="button"
                      disabled={busy || idx === items.length - 1}
                      onClick={() => moveItem(idx, 1)}
                      style={{
                        background: "rgba(0,0,0,0.8)",
                        color: "#fff",
                        border: 0,
                        padding: "3px 8px",
                        borderRadius: 4,
                        fontSize: 12,
                        cursor: idx === items.length - 1 ? "default" : "pointer",
                        opacity: idx === items.length - 1 ? 0.4 : 1,
                      }}
                      title="Mover para direita"
                    >
                      ›
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Add more media */}
          <div className="row" style={{ marginTop: 8 }}>
            <label
              className="btn btn-sm"
              style={{
                cursor: busy ? "not-allowed" : "pointer",
                margin: 0,
                opacity: busy ? 0.6 : 1,
              }}
            >
              + Adicionar imagens ou vídeos
              <input
                type="file"
                multiple
                accept="image/*,video/mp4"
                disabled={busy}
                style={{ display: "none" }}
                onChange={(e) => e.target.files && uploadNewMedia(e.target.files)}
              />
            </label>
            <span className="muted" style={{ fontSize: 12 }}>
              Imagens PNG viram JPEG automaticamente para o Instagram.
            </span>
          </div>
        </div>

        {/* Section 2: Reels Cover & Settings (if single video) */}
        {isReels && (
          <div className="step" style={{ marginBottom: 18, background: "var(--card)" }}>
            <strong>Capa e Configurações do Reels</strong>
            <div className="row" style={{ gap: 16, alignItems: "flex-start", marginTop: 10 }}>
              <div
                style={{
                  width: 110,
                  aspectRatio: "9/16",
                  background: "#000",
                  borderRadius: 8,
                  overflow: "hidden",
                  flex: "0 0 auto",
                  position: "relative",
                  border: "2px solid var(--line)",
                }}
              >
                {cover ? (
                  <img
                    src={cover}
                    alt="Capa personalizada"
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

              <div style={{ flex: 1, minWidth: 220 }}>
                <label style={{ margin: "0 0 6px" }}>
                  Imagem de capa personalizada (1080x1920)
                </label>
                <input
                  type="file"
                  accept="image/*"
                  disabled={busy}
                  onChange={(e) => e.target.files?.[0] && uploadCover(e.target.files[0])}
                />

                {cover ? (
                  <div style={{ marginTop: 8 }}>
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => setCover("")}
                      disabled={busy}
                    >
                      Remover capa personalizada e usar frame do vídeo
                    </button>
                  </div>
                ) : (
                  <div style={{ marginTop: 10 }}>
                    <label style={{ margin: "0 0 4px" }}>
                      Ou escolher o frame do vídeo: {offset.toFixed(1)}s
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={60}
                      step={0.5}
                      value={offset}
                      onChange={(e) => setOffset(Number(e.target.value))}
                    />
                  </div>
                )}

                <label className="row" style={{ gap: 8, marginTop: 12, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={toFeed}
                    onChange={(e) => setToFeed(e.target.checked)}
                    style={{ width: "auto" }}
                  />
                  <span>Mostrar também na grade do feed do perfil</span>
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Section 3: Redes Sociais */}
        <div style={{ marginBottom: 18 }}>
          <label style={{ fontWeight: 600, fontSize: 14 }}>Onde publicar</label>
          <div className="row" style={{ gap: 20, marginTop: 4 }}>
            <label className="row" style={{ gap: 8, margin: 0, cursor: "pointer" }}>
              <input
                type="checkbox"
                style={{ width: "auto" }}
                checked={targets.includes("instagram")}
                onChange={() => toggleTarget("instagram")}
              />
              <span>Instagram</span>
            </label>

            <label
              className="row"
              style={{
                gap: 8,
                margin: 0,
                cursor: ttOk ? "pointer" : "not-allowed",
                opacity: ttOk ? 1 : 0.6,
              }}
            >
              <input
                type="checkbox"
                style={{ width: "auto" }}
                checked={targets.includes("tiktok")}
                disabled={!ttOk}
                onChange={() => toggleTarget("tiktok")}
              />
              <span>TikTok {!ttOk && <span className="muted">(conecte na aba Início)</span>}</span>
            </label>
          </div>
          {ttWarn && (
            <div className="alert alert-err" style={{ marginTop: 8, fontSize: 13 }}>
              {ttWarn}
            </div>
          )}
        </div>

        {/* Section 4: Legenda */}
        <div style={{ marginBottom: 18 }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <label style={{ fontWeight: 600, fontSize: 14 }}>Legenda</label>
            <span className="muted" style={{ fontSize: 12 }}>
              {caption.length}/2200 caracteres
            </span>
          </div>
          <textarea
            value={caption}
            maxLength={2200}
            rows={5}
            style={{ minHeight: 120, lineHeight: 1.5 }}
            placeholder="Escreva a legenda da postagem..."
            onChange={(e) => setCaption(e.target.value)}
          />
        </div>

        {/* Section 5: Palavra do CTA e Link */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 14,
            marginBottom: 18,
          }}
        >
          <div>
            <label style={{ fontWeight: 600 }}>Palavra do CTA (cria automação)</label>
            <input
              value={keyword}
              placeholder="ex: OFERTA ou MANUAL"
              onChange={(e) => setKeyword(e.target.value)}
            />
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              Dispara envio no Direct quando comentarem essa palavra.
            </div>
          </div>
          <div>
            <label style={{ fontWeight: 600 }}>Link do material (opcional)</label>
            <input
              value={link}
              placeholder="https://..."
              onChange={(e) => setLink(e.target.value)}
            />
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              Link enviado no botão dentro do direct.
            </div>
          </div>
        </div>

        {/* Section 5.1: Primeiro comentário automático */}
        <div style={{ marginBottom: 18 }}>
          <label style={{ fontWeight: 600, display: "flex", justifyContent: "space-between" }}>
            <span>💬 Primeiro comentário automático (Fixar / Merchandising)</span>
            <span className="muted" style={{ fontSize: 12 }}>Publicado logo após o post ir ao ar</span>
          </label>
          <textarea
            rows={3}
            value={firstComment}
            placeholder="Deixe em branco se não quiser comentar automaticamente..."
            onChange={(e) => setFirstComment(e.target.value)}
            style={{ width: "100%", fontSize: 13, resize: "vertical", marginTop: 4 }}
          />
        </div>

        {/* Section 6: Data, Hora e Status */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 14,
            marginBottom: 20,
            padding: 14,
            border: "1px solid var(--line)",
            borderRadius: 12,
            background: "var(--bg)",
          }}
        >
          <div>
            <label style={{ margin: "0 0 6px", fontWeight: 600 }}>Status do agendamento</label>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as "scheduled" | "draft")}
            >
              <option value="scheduled">Agendado (publicará automaticamente)</option>
              <option value="draft">Rascunho (salvar sem agendar data)</option>
            </select>
          </div>

          {mode === "scheduled" && (
            <div>
              <label style={{ margin: "0 0 6px", fontWeight: 600 }}>Data e hora de postagem</label>
              <input
                type="datetime-local"
                value={when}
                onChange={(e) => setWhen(e.target.value)}
              />
            </div>
          )}
        </div>

        {/* Feedback message */}
        {msg && (
          <div
            className={`alert ${msg.toLowerCase().includes("erro") || msg.toLowerCase().includes("falha") ? "alert-err" : "alert-ok"}`}
            style={{ marginBottom: 14 }}
          >
            {msg}
          </div>
        )}

        {/* Action Buttons */}
        <div
          className="row"
          style={{
            justifyContent: "space-between",
            paddingTop: 14,
            borderTop: "1px solid var(--line)",
          }}
        >
          <button type="button" className="btn" onClick={onClose} disabled={busy}>
            Cancelar
          </button>

          <div className="row" style={{ gap: 10 }}>
            {["draft", "scheduled", "error"].includes(post.status) && (
              <button
                type="button"
                className="btn"
                disabled={busy}
                onClick={() => saveChanges(true)}
                title="Salva as edições e publica agora no Instagram"
              >
                Salvar e publicar agora
              </button>
            )}

            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() => saveChanges(false)}
            >
              {busy ? "Salvando..." : "Salvar alterações"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

