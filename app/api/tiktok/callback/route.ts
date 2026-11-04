import { NextRequest, NextResponse } from "next/server";
import { saveTikTok, ttExchange, ttUserInfo } from "@/lib/tiktok";
import { requireUser } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const back = (q: string) => NextResponse.redirect(`${process.env.APP_URL}/dashboard?${q}`);
  const { user } = await requireUser();
  if (!user) return NextResponse.redirect(`${process.env.APP_URL}/login`);
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  if (!code || !state || state !== req.cookies.get("tt_state")?.value) return back("tt=erro&msg=estado_invalido");
  try {
    const t = await ttExchange(code);
    const me = await ttUserInfo(t.access_token);
    await saveTikTok(user.id, t, { username: me.display_name ?? null, avatar_url: me.avatar_url ?? null });
    const res = back("tt=conectado");
    res.cookies.delete("tt_state");
    return res;
  } catch (e: any) {
    console.error(e);
    return back("tt=erro&msg=" + encodeURIComponent(e.message ?? "falha"));
  }
}
