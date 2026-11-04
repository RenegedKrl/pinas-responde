"use client";
import { useEffect, useState } from "react";

interface Item { url: string; type: "image" | "video" }
interface P {
  kind: string; items: Item[]; caption: string; scheduled_at: string | null; published_at: string | null;
  status: string; permalink: string | null; automation: any;
}

// Janela que mostra o carrossel como no Instagram: cards, legenda e automação do CTA
export default function PostPreview({ post, onClose }: { post: P; onClose: () => void }) {
  const [i, setI] = useState(0);
  const n = post.items.length;
  const go = (d: number) => setI((x) => Math.min(n - 1, Math.max(0, x + d)));

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [n]);

  const it = post.items[i];
  const a = post.automation;
  const when = post.published_at || post.scheduled_at;
  let touchX = 0;

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.75)", zIndex: 50, overflowY: "auto", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} className="card" style={{ maxWidth: 480, margin: "0 auto", padding: 0, overflow: "hidden" }}>
        <div className="row" style={{ justifyContent: "space-between", padding: "12px 16px" }}>
          <strong>{post.kind === "CAROUSEL" ? `Carrossel · ${i + 1}/${n}` : post.kind === "REELS" ? "Reels" : "Imagem"}</strong>
          <button className="btn btn-sm" onClick={onClose}>Fechar ✕</button>
        </div>

        <div style={{ position: "relative", background: "#000", aspectRatio: "4/5" }}
          onTouchStart={(e) => { touchX = e.touches[0].clientX; }}
          onTouchEnd={(e) => { const d = e.changedTouches[0].clientX - touchX; if (Math.abs(d) > 40) go(d < 0 ? 1 : -1); }}>
          {it && (it.type === "video"
            ? <video key={it.url} src={it.url} autoPlay loop muted playsInline controls style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            : <img key={it.url} src={it.url} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />)}
          {i > 0 && <button onClick={() => go(-1)} className="btn btn-sm" style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", borderRadius: 99 }}>‹</button>}
          {i < n - 1 && <button onClick={() => go(1)} className="btn btn-sm" style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", borderRadius: 99 }}>›</button>}
        </div>

        {n > 1 && (
          <div className="row" style={{ gap: 6, padding: "10px 16px", overflowX: "auto", flexWrap: "nowrap" }}>
            {post.items.map((m, j) => (
              <div key={m.url} onClick={() => setI(j)} style={{ flex: "0 0 52px", height: 65, borderRadius: 6, overflow: "hidden", cursor: "pointer", border: `2px solid ${j === i ? "var(--brand)" : "transparent"}` }}>
                {m.type === "video" ? <video src={m.url} muted style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <img src={m.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
              </div>
            ))}
          </div>
        )}

        <div style={{ padding: "4px 16px 16px" }}>
          <p className="muted" style={{ fontSize: 13, margin: "6px 0" }}>
            {post.status === "published" ? "Publicado em " : post.status === "draft" ? "Rascunho" : "Agendado para "}
            {when && post.status !== "draft" ? new Date(when).toLocaleString("pt-BR") : ""}
            {post.permalink && <> · <a href={post.permalink} target="_blank" rel="noreferrer" style={{ color: "var(--brand)" }}>ver no Instagram</a></>}
          </p>
          {post.kind === "REELS" && (post.items[0] as any)?.cover && (
            <p className="muted" style={{ fontSize: 13 }}>Capa: <img src={(post.items[0] as any).cover} alt="" width={40} height={71} style={{ objectFit: "cover", borderRadius: 4, verticalAlign: "middle" }} /></p>
          )}
          <div style={{ whiteSpace: "pre-wrap", fontSize: 14 }}>{post.caption}</div>

          {a && (
            <div className="step" style={{ marginTop: 14 }}>
              <strong>Automação do CTA: {a.keywords?.join(", ")}</strong>
              <p className="muted" style={{ fontSize: 13, margin: "6px 0" }}>Resposta no comentário: {a.comment_replies?.join(" · ")}</p>
              <p style={{ fontSize: 13, margin: "6px 0" }}>Direct: {a.welcome_message} <span className="chip">{a.button_label}</span></p>
              {(a.steps ?? []).filter((s: any) => s.type !== "wait").map((s: any, j: number) => (
                <p key={j} style={{ fontSize: 13, margin: "4px 0" }}>
                  {j + 1}. {s.text}{s.url && <> <a href={s.url} target="_blank" rel="noreferrer" style={{ color: "var(--brand)" }}>[{s.label || "abrir"}]</a></>}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
