import { Receiver } from "@upstash/qstash";
import { NextRequest, NextResponse } from "next/server";
import { runSteps } from "@/lib/engine";

export const runtime = "nodejs";
export const maxDuration = 60;

// Chamado pelo QStash para continuar uma sequência após um "esperar"
export async function POST(req: NextRequest) {
  const raw = await req.text();
  const cur = process.env.QSTASH_CURRENT_SIGNING_KEY, next = process.env.QSTASH_NEXT_SIGNING_KEY;
  if (!cur || !next) return new NextResponse("qstash não configurado", { status: 500 });
  const ok = await new Receiver({ currentSigningKey: cur, nextSigningKey: next })
    .verify({ signature: req.headers.get("upstash-signature") ?? "", body: raw })
    .catch(() => false);
  if (!ok) return new NextResponse("invalid signature", { status: 401 });

  const { igUserId, automationId, igsid, start } = JSON.parse(raw);
  await runSteps(String(igUserId), String(automationId), String(igsid), Number(start) || 0);
  return NextResponse.json({ ok: true });
}
