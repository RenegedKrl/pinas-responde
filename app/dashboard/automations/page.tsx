"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type { Automation, Folder } from "@/lib/types";

export default function Automations() {
  const sb = supabaseBrowser();
  const router = useRouter();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [items, setItems] = useState<Automation[]>([]);
  const [folder, setFolder] = useState<string | "all" | "none">("all");
  const [stats, setStats] = useState<Record<string, { sent: number; clicks: number }>>({});

  async function load() {
    const [f, a, e] = await Promise.all([
      sb.from("folders").select("id,name").order("name"),
      sb.from("automations").select("*").order("updated_at", { ascending: false }),
      sb.from("events").select("automation_id,type").in("type", ["private_reply", "click"]).limit(10000),
    ]);
    setFolders(f.data ?? []);
    setItems((a.data as Automation[]) ?? []);
    const s: Record<string, { sent: number; clicks: number }> = {};
    for (const ev of e.data ?? []) {
      const k = ev.automation_id as string;
      s[k] ??= { sent: 0, clicks: 0 };
      if (ev.type === "click") s[k].clicks++; else s[k].sent++;
    }
    setStats(s);
  }
  useEffect(() => { load(); }, []);

  async function newFolder() {
    const name = prompt("Nome da pasta:");
    if (!name?.trim()) return;
    const { data: u } = await sb.auth.getUser();
    await sb.from("folders").insert({ name: name.trim(), user_id: u.user!.id });
    load();
  }
  async function delFolder(id: string) {
    if (!confirm("Apagar a pasta? As automações ficam sem pasta.")) return;
    await sb.from("folders").delete().eq("id", id);
    setFolder("all"); load();
  }
  async function newAutomation() {
    const { data: u } = await sb.auth.getUser();
    const { data, error } = await sb.from("automations").insert({
      user_id: u.user!.id,
      folder_id: folder !== "all" && folder !== "none" ? folder : null,
      comment_replies: ["Te mandei no direct! 📩", "Olha sua DM 😉", "Enviado! Confere o direct"],
      welcome_message: "Oi! Vi seu comentário. Clica no botão abaixo que eu te envio 👇",
    }).select("id").single();
    if (error) return alert(error.message);
    router.push(`/dashboard/automations/${data.id}`);
  }
  async function toggle(a: Automation) {
    await sb.from("automations").update({ active: !a.active, updated_at: new Date().toISOString() }).eq("id", a.id);
    load();
  }

  const shown = items.filter((a) =>
    folder === "all" ? true : folder === "none" ? !a.folder_id : a.folder_id === folder);

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 14 }}>
        <h1 style={{ margin: 0 }}>Automações</h1>
        <button className="btn btn-primary" onClick={newAutomation}>+ Nova automação</button>
      </div>

      <div className="row" style={{ marginBottom: 16 }}>
        <button className={`btn btn-sm ${folder === "all" ? "btn-primary" : ""}`} onClick={() => setFolder("all")}>Todas</button>
        <button className={`btn btn-sm ${folder === "none" ? "btn-primary" : ""}`} onClick={() => setFolder("none")}>Sem pasta</button>
        {folders.map((f) => (
          <span key={f.id} className="row" style={{ gap: 2 }}>
            <button className={`btn btn-sm ${folder === f.id ? "btn-primary" : ""}`} onClick={() => setFolder(f.id)}>📁 {f.name}</button>
            {folder === f.id && <button className="btn btn-sm btn-danger" onClick={() => delFolder(f.id)}>✕</button>}
          </span>
        ))}
        <button className="btn btn-sm" onClick={newFolder}>+ Pasta</button>
      </div>

      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table>
          <thead><tr><th>Nome</th><th>Palavras</th><th>Posts</th><th>Enviados</th><th>Cliques</th><th>Status</th></tr></thead>
          <tbody>
            {shown.map((a) => (
              <tr key={a.id}>
                <td><Link href={`/dashboard/automations/${a.id}`} style={{ fontWeight: 600 }}>{a.name}</Link></td>
                <td className="muted">{a.keywords.length ? a.keywords.join(", ") : "qualquer comentário"}</td>
                <td className="muted">{a.post_ids.length || "todos"}</td>
                <td>{stats[a.id]?.sent ?? 0}</td>
                <td>{stats[a.id]?.clicks ?? 0}</td>
                <td>
                  <button className={`badge ${a.active ? "badge-on" : ""}`} style={{ border: 0, cursor: "pointer" }} onClick={() => toggle(a)}>
                    {a.active ? "Ativa" : "Pausada"}
                  </button>
                </td>
              </tr>
            ))}
            {!shown.length && <tr><td colSpan={6} className="muted" style={{ textAlign: "center", padding: 30 }}>Nenhuma automação aqui ainda.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
