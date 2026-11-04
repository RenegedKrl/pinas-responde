import { NextResponse } from "next/server";
import { runDue } from "@/lib/publish";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

// Chamado a cada minuto pelo pg_cron do Supabase. Só processa posts já aprovados e vencidos.
export async function GET() {
  return NextResponse.json(await runDue());
}
