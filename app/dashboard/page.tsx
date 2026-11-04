import Link from "next/link";
import { requireUser } from "@/lib/supabase-server";
import DisconnectButton from "@/components/DisconnectButton";
import TokenConnect from "@/components/TokenConnect";

export const dynamic = "force-dynamic";

export default async function Dashboard({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { sb, user } = await requireUser();
  const { data: acc } = await sb.from("ig_accounts")
    .select("username, profile_picture_url, token_expires_at").eq("user_id", user!.id).maybeSingle();

  const { data: tt } = await sb.from("tiktok_accounts")
    .select("username, avatar_url, refresh_expires_at").eq("user_id", user!.id).maybeSingle();
  const expired = !acc?.token_expires_at || new Date(acc.token_expires_at).getTime() < Date.now();
  const since =new Date(Date.now() - 7 * 86_400_000).toISOString();
  const count = async (type: string) =>
    (await sb.from("events").select("id", { count: "exact", head: true }).eq("type", type).gte("created_at", since)).count ?? 0;
  const [replies, dms, clicks, errors] = await Promise.all([
    count("comment_reply"), count("private_reply"), count("click"), count("error"),
  ]);
  const { count: active } = await sb.from("automations").select("id", { count: "exact", head: true }).eq("active", true);

  return (
    <>
      <h1>Início</h1>
      {sp.ig === "conectado" && <div className="alert alert-ok">Instagram conectado com sucesso.</div>}
      {sp.ig === "erro" && <div className="alert alert-err">Falha ao conectar: {sp.msg}</div>}

      <div className="card" style={{ marginBottom: 16 }}>
        <h2>Conta do Instagram</h2>
        {acc ? (
          <div className="row">
            {acc.profile_picture_url && <img src={acc.profile_picture_url} alt="" width={44} height={44} style={{ borderRadius: 99 }} />}
            <div style={{ flex: 1 }}>
              <strong>@{acc.username}</strong>
              {expired ? (
                <div style={{ fontSize: 13, color: "var(--err)" }}>Conexão expirada. Clique em Reconectar.</div>
              ) : (
                <div style={{ fontSize: 13, color: "var(--ok)" }}>
                  ● Conectado 24h · renova sozinho (próxima validade {new Date(acc.token_expires_at!).toLocaleDateString("pt-BR")})
                </div>
              )}
            </div>
            <a className={`btn btn-sm ${expired ? "btn-primary" : ""}`} href="/api/instagram/connect">Reconectar</a>
            <DisconnectButton />
            <TokenConnect />
          </div>
        ) : (
          <div className="row">
            <p className="muted" style={{ flex: 1, margin: 0 }}>Conecte sua conta profissional para começar.</p>
            <a className="btn btn-primary" href="/api/instagram/connect">Conectar Instagram</a>
            <TokenConnect />
          </div>
        )}
      </div>

      {sp.tt === "conectado" && <div className="alert alert-ok">TikTok conectado.</div>}
      {sp.tt === "erro" && <div className="alert alert-err">Falha ao conectar o TikTok: {sp.msg}</div>}
      <div className="card" style={{ marginBottom: 16 }}>
        <h2>Conta do TikTok</h2>
        <div className="row">
          {tt?.avatar_url && <img src={tt.avatar_url} alt="" width={44} height={44} style={{ borderRadius: 99 }} />}
          <div style={{ flex: 1 }}>
            {tt ? <>
              <strong>{tt.username ?? "TikTok"}</strong>
              <div style={{ fontSize: 13, color: "var(--ok)" }}>
                ● Conectado · renova sozinho até {new Date(tt.refresh_expires_at).toLocaleDateString("pt-BR")}
              </div>
            </> : <p className="muted" style={{ margin: 0 }}>Conecte para postar no TikTok pela aba Postagens.</p>}
          </div>
          <a className={`btn btn-sm ${tt ? "" : "btn-primary"}`} href="/api/tiktok/connect">{tt ? "Reconectar" : "Conectar TikTok"}</a>
          {tt && <DisconnectButton api="/api/tiktok/disconnect" />}
        </div>
      </div>

      <h2>Últimos 7 dias</h2>
      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        {[
          ["Respostas em comentários", replies], ["Directs enviados", dms],
          ["Cliques no botão", clicks], ["Automações ativas", active ?? 0],
        ].map(([l, v]) => (
          <div key={l as string} className="card">
            <div className="muted" style={{ fontSize: 13 }}>{l}</div>
            <div style={{ fontSize: 28, fontWeight: 800 }}>{v}</div>
          </div>
        ))}
      </div>
      {errors > 0 && (
        <div className="alert alert-err">{errors} erro(s) nos últimos 7 dias. <Link href="/dashboard/logs" style={{ textDecoration: "underline" }}>Ver atividade</Link></div>
      )}
      <Link className="btn btn-primary" href="/dashboard/automations">Gerenciar automações</Link>
    </>
  );
}
