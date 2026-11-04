import { NextResponse } from "next/server";
import { accountByUser } from "@/lib/accounts";
import { publishingLimit } from "@/lib/publish";
import { requireUser } from "@/lib/supabase-server";

// Testa se o token pode publicar e quantos posts ainda cabem hoje
export async function GET() {
  const { user } = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const acc = await accountByUser(user.id);
  if (!acc) return NextResponse.json({ error: "Instagram não conectado" }, { status: 400 });
  try {
    const r = await publishingLimit(acc);
    const d = r.data?.[0];
    return NextResponse.json({ ok: true, used: d?.quota_usage ?? 0, total: d?.config?.quota_total ?? 50 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message });
  }
}
