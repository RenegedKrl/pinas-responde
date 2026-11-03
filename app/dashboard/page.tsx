import Link from "next/link";
import { requireUser } from "@/lib/supabase-server";
import DisconnectButton from "@/components/DisconnectButton";

export const dynamic = "force-dynamic";

export default async function Dashboard({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const { sb, user } = await requireUser();
  const { data: acc } = await sb.from("ig_accounts")
    .select("username, profile_picture_url, token_expires_at").eq("user_id", user!.id).maybeSingle();

  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
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
              <div className="muted" style={{ fontSize: 13 }}>
                Token válido até {acc.token_expires_at ? new Date(acc.token_expires_at).toLocaleDateString("pt-BR") : "?"} (renova sozinho)
              </div>
            </div>
            <a className="btn btn-sm" href="/api/instagram/connect">Reconectar</a>
            <DisconnectButton />
          </div>
        ) : (
          <div className="row">
            <p className="muted" style={{ flex: 1, margin: 0 }}>Conecte sua conta profissional para começar.</p>
            <a className="btn btn-primary" href="/api/instagram/connect">Conectar Instagram</a>
          </div>
        )}
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
