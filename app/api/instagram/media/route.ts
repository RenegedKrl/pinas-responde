import { NextRequest, NextResponse } from "next/server";
import { accountByUser } from "@/lib/accounts";
import { listMedia } from "@/lib/instagram";
import { requireUser } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const { user } = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const acc = await accountByUser(user.id);
  if (!acc) return NextResponse.json({ error: "Instagram não conectado" }, { status: 400 });
  try {
    const r = await listMedia(acc.token, acc.ig_user_id, req.nextUrl.searchParams.get("after") ?? undefined);
    return NextResponse.json({ data: r.data, after: r.paging?.next ? r.paging?.cursors?.after : null });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
