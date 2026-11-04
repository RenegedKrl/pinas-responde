import { NextResponse } from "next/server";
import crypto from "crypto";
import { ttAuthorizeUrl } from "@/lib/tiktok";
import { requireUser } from "@/lib/supabase-server";

export async function GET() {
  const { user } = await requireUser();
  if (!user) return NextResponse.redirect(`${process.env.APP_URL}/login`);
  const state = crypto.randomBytes(16).toString("hex");
  const res = NextResponse.redirect(ttAuthorizeUrl(state));
  res.cookies.set("tt_state", state, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/" });
  return res;
}
