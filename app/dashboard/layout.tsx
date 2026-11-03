import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase-server";
import LogoutButton from "@/components/LogoutButton";

export default async function DashLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireUser();
  if (!user) redirect("/login");
  return (
    <div className="shell">
      <nav className="side">
        <div className="logo">Pinas Responde</div>
        <Link href="/dashboard">Início</Link>
        <Link href="/dashboard/automations">Automações</Link>
        <Link href="/dashboard/contacts">Contatos</Link>
        <Link href="/dashboard/logs">Atividade</Link>
        <div style={{ flex: 1 }} />
        <div className="muted" style={{ fontSize: 12, padding: "0 12px" }}>{user.email}</div>
        <LogoutButton />
      </nav>
      <main className="main">{children}</main>
    </div>
  );
}
