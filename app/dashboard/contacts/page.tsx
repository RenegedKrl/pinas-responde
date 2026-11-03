import { requireUser } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export default async function Contacts() {
  const { sb } = await requireUser();
  const { data } = await sb.from("contacts")
    .select("igsid, username, last_comment, last_interaction_at, automations(name)")
    .order("last_interaction_at", { ascending: false }).limit(500);
  return (
    <>
      <h1>Contatos</h1>
      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table>
          <thead><tr><th>Usuário</th><th>Último comentário</th><th>Automação</th><th>Quando</th></tr></thead>
          <tbody>
            {(data ?? []).map((c: any) => (
              <tr key={c.igsid}>
                <td>{c.username ? <a href={`https://instagram.com/${c.username}`} target="_blank" rel="noreferrer">@{c.username}</a> : c.igsid}</td>
                <td className="muted">{c.last_comment}</td>
                <td>{c.automations?.name ?? "-"}</td>
                <td className="muted">{new Date(c.last_interaction_at).toLocaleString("pt-BR")}</td>
              </tr>
            ))}
            {!data?.length && <tr><td colSpan={4} className="muted" style={{ textAlign: "center", padding: 30 }}>Nenhum contato ainda.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
