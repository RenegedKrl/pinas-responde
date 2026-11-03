"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type { Automation, Folder, Step, StepType } from "@/lib/types";

interface Media { id: string; caption?: string; media_type: string; media_url?: string; thumbnail_url?: string; permalink: string }

const STEP_LABEL: Record<StepType, string> = {
  text: "💬 Texto", link: "🔗 Link com botão", image: "🖼️ Imagem", video: "🎬 Vídeo", audio: "🎙️ Áudio", wait: "⏱️ Esperar",
};

function ListEditor({ values, onChange, placeholder }: { values: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [v, setV] = useState("");
  const add = () => { const t = v.trim(); if (t && !values.includes(t)) onChange([...values, t]); setV(""); };
  return (
    <>
      <div className="row" style={{ marginBottom: 8 }}>
        {values.map((x) => (
          <span key={x} className="chip">{x}<button type="button" onClick={() => onChange(values.filter((y) => y !== x))}>✕</button></span>
        ))}
      </div>
      <div className="row" style={{ flexWrap: "nowrap" }}>
        <input value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
        <button type="button" className="btn" onClick={add}>Adicionar</button>
      </div>
    </>
  );
}

export default function Editor() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const sb = supabaseBrowser();
  const [a, setA] = useState<Automation | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [media, setMedia] = useState<Media[]>([]);
  const [after, setAfter] = useState<string | null>(null);
  const [mediaErr, setMediaErr] = useState("");
  const [showPicker, setShowPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState("");

  useEffect(() => {
    sb.from("automations").select("*").eq("id", id).single().then(({ data }) => setA(data as Automation));
    sb.from("folders").select("id,name").order("name").then(({ data }) => setFolders(data ?? []));
  }, [id]);

  async function loadMedia(cursor?: string) {
    setMediaErr("");
    const r = await fetch(`/api/instagram/media${cursor ? `?after=${cursor}` : ""}`);
    const j = await r.json();
    if (!r.ok) return setMediaErr(j.error ?? "Erro ao carregar posts");
    setMedia((m) => (cursor ? [...m, ...j.data] : j.data));
    setAfter(j.after);
  }

  if (!a) return <p className="muted">Carregando...</p>;
  const set = (patch: Partial<Automation>) => { setA({ ...a, ...patch }); setSaved(""); };
  const setStep = (i: number, patch: Partial<Step>) => set({ steps: a.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const moveStep = (i: number, d: number) => {
    const s = [...a.steps]; const j = i + d; if (j < 0 || j >= s.length) return;
    [s[i], s[j]] = [s[j], s[i]]; set({ steps: s });
  };

  function togglePost(m: Media) {
    const has = a!.post_ids.includes(m.id);
    set({
      post_ids: has ? a!.post_ids.filter((x) => x !== m.id) : [...a!.post_ids, m.id],
      post_previews: has
        ? a!.post_previews.filter((p) => p.id !== m.id)
        : [...a!.post_previews, { id: m.id, thumb: m.thumbnail_url || m.media_url, caption: m.caption?.slice(0, 80) }],
    });
  }

  async function upload(i: number, file: File) {
    const { data: u } = await sb.auth.getUser();
    const path = `${u.user!.id}/${Date.now()}-${file.name.replace(/[^\w.-]/g, "_")}`;
    const { error } = await sb.storage.from("media").upload(path, file, { contentType: file.type });
    if (error) return alert("Falha no upload: " + error.message);
    setStep(i, { url: sb.storage.from("media").getPublicUrl(path).data.publicUrl });
  }

  async function save() {
    setSaving(true);
    const { id: _id, user_id, created_at, ...rest } = a!;
    const { error } = await sb.from("automations").update({ ...rest, updated_at: new Date().toISOString() }).eq("id", a!.id);
    setSaving(false);
    setSaved(error ? "Erro: " + error.message : "Salvo ✓");
  }

  async function remove() {
    if (!confirm("Apagar esta automação?")) return;
    await sb.from("automations").delete().eq("id", a!.id);
    router.push("/dashboard/automations");
  }

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 16 }}>
        <input value={a.name} onChange={(e) => set({ name: e.target.value })} style={{ fontSize: 20, fontWeight: 700, maxWidth: 480 }} />
        <div className="row">
          <span className="muted">{saved}</span>
          <label className="row" style={{ margin: 0, color: "var(--text)" }}>
            <input type="checkbox" style={{ width: "auto" }} checked={a.active} onChange={(e) => set({ active: e.target.checked })} /> Ativa
          </label>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</button>
        </div>
      </div>

      <div className="grid">
        <div className="card">
          <h2>Pasta</h2>
          <select value={a.folder_id ?? ""} onChange={(e) => set({ folder_id: e.target.value || null })}>
            <option value="">Sem pasta</option>
            {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </div>

        <div className="card">
          <h2>1. Quando alguém comentar em</h2>
          <div className="row" style={{ marginBottom: 10 }}>
            {a.post_previews.map((p) => (
              <div key={p.id} className="chip">
                {p.thumb && <img src={p.thumb} alt="" width={28} height={34} style={{ objectFit: "cover", borderRadius: 4 }} />}
                {p.caption?.slice(0, 30) || p.id}
                <button type="button" onClick={() => set({ post_ids: a.post_ids.filter((x) => x !== p.id), post_previews: a.post_previews.filter((x) => x.id !== p.id) })}>✕</button>
              </div>
            ))}
            {!a.post_ids.length && <span className="muted">Qualquer post ou Reel</span>}
          </div>
          <button className="btn btn-sm" onClick={() => { setShowPicker(!showPicker); if (!media.length) loadMedia(); }}>
            {showPicker ? "Fechar" : "Escolher posts"}
          </button>
          {showPicker && (
            <div style={{ marginTop: 12 }}>
              {mediaErr && <div className="alert alert-err">{mediaErr}</div>}
              <div className="media-grid">
                {media.map((m) => (
                  <div key={m.id} className={`media-item ${a.post_ids.includes(m.id) ? "sel" : ""}`} onClick={() => togglePost(m)} title={m.caption}>
                    <img src={m.thumbnail_url || m.media_url} alt="" />
                  </div>
                ))}
              </div>
              {after && <button className="btn btn-sm" style={{ marginTop: 10 }} onClick={() => loadMedia(after)}>Carregar mais</button>}
            </div>
          )}
        </div>

        <div className="card">
          <h2>2. Com estas palavras</h2>
          <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>Acentos e maiúsculas são ignorados. Vazio = responde qualquer comentário.</p>
          <ListEditor values={a.keywords} onChange={(v) => set({ keywords: v })} placeholder="ex: análise" />
        </div>

        <div className="card">
          <h2>3. Responder no comentário</h2>
          <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>Uma frase é sorteada a cada vez. Vazio = não responde em público.</p>
          <ListEditor values={a.comment_replies} onChange={(v) => set({ comment_replies: v })} placeholder="ex: Te mandei no direct! 📩" />
        </div>

        <div className="card">
          <h2>4. Primeira mensagem no direct</h2>
          <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
            O Instagram permite só 1 mensagem antes da pessoa interagir. Por isso ela vai com um botão: o clique libera a sequência abaixo.
          </p>
          <textarea value={a.welcome_message} maxLength={640} onChange={(e) => set({ welcome_message: e.target.value })} />
          <label>Texto do botão (até 20 caracteres)</label>
          <input value={a.button_label} maxLength={20} onChange={(e) => set({ button_label: e.target.value })} />
        </div>

        <div className="card">
          <h2>5. Depois do clique, enviar</h2>
          {a.steps.map((s, i) => (
            <div key={i} className="step">
              <div className="row" style={{ justifyContent: "space-between" }}>
                <strong>{i + 1}. {STEP_LABEL[s.type]}</strong>
                <div className="row" style={{ gap: 4 }}>
                  <button className="btn btn-sm" onClick={() => moveStep(i, -1)}>↑</button>
                  <button className="btn btn-sm" onClick={() => moveStep(i, 1)}>↓</button>
                  <button className="btn btn-sm btn-danger" onClick={() => set({ steps: a.steps.filter((_, j) => j !== i) })}>✕</button>
                </div>
              </div>
              {s.type === "text" && <textarea value={s.text ?? ""} maxLength={1000} onChange={(e) => setStep(i, { text: e.target.value })} />}
              {s.type === "link" && (
                <>
                  <label>Texto da mensagem</label>
                  <textarea value={s.text ?? ""} maxLength={640} onChange={(e) => setStep(i, { text: e.target.value })} />
                  <label>URL</label>
                  <input value={s.url ?? ""} placeholder="https://..." onChange={(e) => setStep(i, { url: e.target.value })} />
                  <label>Texto do botão</label>
                  <input value={s.label ?? ""} maxLength={20} placeholder="Abrir" onChange={(e) => setStep(i, { label: e.target.value })} />
                </>
              )}
              {(s.type === "image" || s.type === "video" || s.type === "audio") && (
                <>
                  <label>Arquivo ({s.type === "audio" ? "mp3, m4a, wav" : s.type === "video" ? "mp4" : "jpg, png"})</label>
                  <input type="file" accept={s.type === "audio" ? "audio/*" : s.type === "video" ? "video/mp4" : "image/*"}
                    onChange={(e) => e.target.files?.[0] && upload(i, e.target.files[0])} />
                  <label>ou URL pública</label>
                  <input value={s.url ?? ""} onChange={(e) => setStep(i, { url: e.target.value })} />
                  {s.url && s.type === "audio" && <audio controls src={s.url} style={{ marginTop: 8, width: "100%" }} />}
                  {s.url && s.type === "image" && <img src={s.url} alt="" style={{ marginTop: 8, maxHeight: 160, borderRadius: 8 }} />}
                </>
              )}
              {s.type === "wait" && (
                <>
                  <label>Segundos</label>
                  <input type="number" min={1} max={86400} value={s.seconds ?? 5} onChange={(e) => setStep(i, { seconds: Number(e.target.value) })} />
                </>
              )}
            </div>
          ))}
          <div className="row">
            {(Object.keys(STEP_LABEL) as StepType[]).map((t) => (
              <button key={t} className="btn btn-sm" onClick={() => set({ steps: [...a.steps, { type: t, ...(t === "wait" ? { seconds: 5 } : {}) }] })}>
                + {STEP_LABEL[t]}
              </button>
            ))}
          </div>
          <p className="muted" style={{ fontSize: 13 }}>PDF e outros arquivos: use “Link com botão”. Esperas acima de 8s exigem o QStash configurado.</p>
        </div>

        <div className="row" style={{ justifyContent: "space-between" }}>
          <button className="btn btn-danger" onClick={remove}>Apagar automação</button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</button>
        </div>
      </div>
    </>
  );
}
