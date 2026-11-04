import { NextRequest, NextResponse } from "next/server";
import { runDue } from "@/lib/publish";
import { requireUser } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { sb, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { error } = await sb.from("posts")
    .update({ status: "scheduled", scheduled_at: new Date().toISOString(), error: null, containers: {}, tiktok: {} })
    .eq("id", id).neq("status", "publishing").neq("status", "published");
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const r = await runDue();
  return NextResponse.json({ result: r[id] ?? "na fila" });
}
