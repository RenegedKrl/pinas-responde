import { NextResponse } from "next/server";
import { requireUser, supabaseAdmin } from "@/lib/supabase-server";

export async function POST() {
  const { user } = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await supabaseAdmin().from("ig_accounts").delete().eq("user_id", user.id);
  return NextResponse.json({ ok: true });
}
