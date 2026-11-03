import { NextRequest, NextResponse } from "next/server";
import { encrypt } from "@/lib/crypto";
import { exchangeCode, getMe, subscribeWebhooks } from "@/lib/instagram";
import { requireUser, supabaseAdmin } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const back = (q: string) => NextResponse.redirect(`${process.env.APP_URL}/dashboard?${q}`);
  const { user } = await requireUser();
  if (!user) return NextResponse.redirect(`${process.env.APP_URL}/login`);

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  if (!code || !state || state !== req.cookies.get("ig_state")?.value) return back("ig=erro&msg=estado_invalido");

  try {
    const { access_token, expires_in } = await exchangeCode(code.replace(/#_$/, ""));
    const me = await getMe(access_token);
    await subscribeWebhooks(access_token);
    const { error } = await supabaseAdmin().from("ig_accounts").upsert(
      {
        user_id: user.id,
        ig_user_id: String(me.user_id),
        username: me.username,
        profile_picture_url: me.profile_picture_url ?? null,
        access_token: encrypt(access_token),
        token_expires_at: new Date(Date.now() + expires_in * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "ig_user_id" }
    );
    if (error) throw new Error(error.message);
    const res = back("ig=conectado");
    res.cookies.delete("ig_state");
    return res;
  } catch (e: any) {
    console.error(e);
    return back("ig=erro&msg=" + encodeURIComponent(e.message ?? "falha"));
  }
}
