import { after, NextRequest, NextResponse } from "next/server";
import { accountByIgId } from "@/lib/accounts";
import { hmacSha256, safeEqual } from "@/lib/crypto";
import { handleComment, handleMessaging } from "@/lib/engine";

export const runtime = "nodejs";
export const maxDuration = 60;

// Verificação do webhook pela Meta
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  if (p.get("hub.mode") === "subscribe" && p.get("hub.verify_token") === process.env.WEBHOOK_VERIFY_TOKEN) {
    return new NextResponse(p.get("hub.challenge") ?? "", { status: 200 });
  }
  return new NextResponse("forbidden", { status: 403 });
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const sig = req.headers.get("x-hub-signature-256") ?? "";
  const expected = "sha256=" + hmacSha256(process.env.IG_APP_SECRET ?? "", raw);
  if (!sig || !safeEqual(sig, expected)) {
    return new NextResponse("invalid signature", { status: 401 });
  }

  const body = JSON.parse(raw);
  // responde 200 na hora e processa depois (a Meta exige resposta rápida)
  after(async () => {
    for (const entry of body.entry ?? []) {
      try {
        const account = await accountByIgId(String(entry.id));
        if (!account) continue;
        for (const ch of entry.changes ?? []) {
          if (ch.field === "comments" || ch.field === "live_comments") await handleComment(account, ch.value);
        }
        for (const m of entry.messaging ?? []) await handleMessaging(account, m);
      } catch (e) {
        console.error("webhook entry error", e);
      }
    }
  });
  return NextResponse.json({ ok: true });
}
