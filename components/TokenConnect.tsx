"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function TokenConnect() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true); setMsg("");
    const r = await fetch("/api/instagram/token", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }),
    });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) return setMsg(j.error ?? "Falha");
    setToken(""); setOpen(false); router.refresh();
  }

  if (!open) return <button className="btn btn-sm" onClick={() => setOpen(true)}>Conectar com token</button>;
  return (
    <div style={{ width: "100%", marginTop: 10 }}>
      <label>Cole o token de Meta Developers → API do Instagram → 2. Gerar tokens → Gerar token</label>
      <div className="row" style={{ flexWrap: "nowrap" }}>
        <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="IGAA..." />
        <button className="btn btn-primary" onClick={save} disabled={busy || !token}>{busy ? "..." : "Salvar"}</button>
      </div>
      {msg && <div className="alert alert-err" style={{ marginTop: 8 }}>{msg}</div>}
    </div>
  );
}
