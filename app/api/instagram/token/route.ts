import { NextRequest, NextResponse } from "next/server";
import { encrypt } from "@/lib/crypto";
import { getMe, subscribeWebhooks } from "@/lib/instagram";
import { requireUser, supabaseAdmin } from "@/lib/supabase-server";

// Conecta colando o token gerado em Meta Developers > API do Instagram > "Gerar token"
export async function POST(req: NextRequest) {
  const { user } = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { token } = await req.json().catch(() => ({}));
  if (!token || typeof token !== "string") return NextResponse.json({ error: "Token vazio" }, { status: 400 });
  const t = token.trim();
  try {
    const me = await getMe(t);
    await subscribeWebhooks(t).catch(() => null); // já pode estar assinado pelo painel da Meta
    const { error } = await supabaseAdmin().from("ig_accounts").upsert(
      {
        user_id: user.id,
        ig_user_id: String(me.user_id),
        username: me.username,
        profile_picture_url: me.profile_picture_url ?? null,
        access_token: encrypt(t),
        token_expires_at: new Date(Date.now() + 60 * 86_400_000).toISOString(), // tokens do painel valem ~60 dias; o cron renova
        updated_at: new Date().toISOString(),
      },
      { onConflict: "ig_user_id" }
    );
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, username: me.username });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
