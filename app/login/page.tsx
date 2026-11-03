"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";

export default function Login() {
  const router = useRouter();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setMsg(null);
    const sb = supabaseBrowser();
    if (mode === "in") {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) setMsg({ ok: false, text: "E-mail ou senha inválidos." });
      else { router.replace("/dashboard"); router.refresh(); }
    } else {
      const { data, error } = await sb.auth.signUp({
        email, password, options: { emailRedirectTo: `${location.origin}/auth/callback` },
      });
      if (error) setMsg({ ok: false, text: error.message });
      else if (data.session) { router.replace("/dashboard"); router.refresh(); }
      else setMsg({ ok: true, text: "Conta criada. Confirme pelo link enviado ao seu e-mail." });
    }
    setLoading(false);
  }

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16 }}>
      <form onSubmit={submit} className="card" style={{ width: "100%", maxWidth: 380 }}>
        <h1 style={{ marginBottom: 4 }}>Pinas Responde</h1>
        <p className="muted" style={{ marginTop: 0 }}>{mode === "in" ? "Entre na sua conta" : "Crie sua conta"}</p>
        {msg && <div className={`alert ${msg.ok ? "alert-ok" : "alert-err"}`}>{msg.text}</div>}
        <label>E-mail</label>
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        <label>Senha</label>
        <input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)}
          autoComplete={mode === "in" ? "current-password" : "new-password"} />
        <button className="btn btn-primary" style={{ width: "100%", marginTop: 18, justifyContent: "center" }} disabled={loading}>
          {loading ? "Aguarde..." : mode === "in" ? "Entrar" : "Criar conta"}
        </button>
        <p className="muted" style={{ textAlign: "center", fontSize: 14 }}>
          {mode === "in" ? "Não tem conta? " : "Já tem conta? "}
          <a href="#" style={{ color: "var(--brand)" }} onClick={(e) => { e.preventDefault(); setMode(mode === "in" ? "up" : "in"); setMsg(null); }}>
            {mode === "in" ? "Criar conta" : "Entrar"}
          </a>
        </p>
      </form>
    </div>
  );
}
