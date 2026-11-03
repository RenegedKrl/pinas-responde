import { NextRequest, NextResponse } from "next/server";
import { decrypt, encrypt } from "@/lib/crypto";
import { refreshToken } from "@/lib/instagram";
import { supabaseAdmin } from "@/lib/supabase-server";

// Vercel Cron diário: renova tokens que vencem em menos de 20 dias
export async function GET(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("unauthorized", { status: 401 });
  }
  const db = supabaseAdmin();
  const limit = new Date(Date.now() + 20 * 86_400_000).toISOString();
  const { data } = await db.from("ig_accounts").select("id, access_token").lt("token_expires_at", limit);
  let ok = 0;
  for (const a of data ?? []) {
    try {
      const r = await refreshToken(decrypt(a.access_token));
      await db.from("ig_accounts").update({
        access_token: encrypt(r.access_token),
        token_expires_at: new Date(Date.now() + r.expires_in * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", a.id);
      ok++;
    } catch (e) {
      console.error("refresh fail", a.id, e);
    }
  }
  return NextResponse.json({ refreshed: ok });
}
