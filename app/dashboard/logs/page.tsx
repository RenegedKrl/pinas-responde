import { requireUser } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const LABEL: Record<string, string> = {
  comment_reply: "Respondeu comentário", private_reply: "Direct enviado", click: "Clicou no botão", step: "Mensagem da sequência", error: "Erro",
};

export default async function Logs() {
  const { sb } = await requireUser();
  const { data } = await sb.from("events")
    .select("id, type, detail, igsid, created_at, automations(name)")
    .order("created_at", { ascending: false }).limit(200);
  return (
    <>
      <h1>Atividade</h1>
      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table>
          <thead><tr><th>Quando</th><th>Evento</th><th>Automação</th><th>Detalhe</th></tr></thead>
          <tbody>
            {(data ?? []).map((e: any) => (
              <tr key={e.id}>
                <td className="muted" style={{ whiteSpace: "nowrap" }}>{new Date(e.created_at).toLocaleString("pt-BR")}</td>
                <td style={{ color: e.type === "error" ? "var(--err)" : undefined }}>{LABEL[e.type] ?? e.type}</td>
                <td>{e.automations?.name ?? "-"}</td>
                <td className="muted">{e.detail}</td>
              </tr>
            ))}
            {!data?.length && <tr><td colSpan={4} className="muted" style={{ textAlign: "center", padding: 30 }}>Sem atividade ainda.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
