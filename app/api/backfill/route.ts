import { NextResponse } from "next/server";
import { accountByUser } from "@/lib/accounts";
import { handleComment } from "@/lib/engine";
import { listComments } from "@/lib/instagram";
import { requireUser } from "@/lib/supabase-server";
import { matchesKeyword } from "@/lib/text";
import type { Automation } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const SEVEN_DAYS = 7 * 86_400_000 - 3_600_000; // margem de 1h antes do limite da Meta

// Responde comentários que chegaram antes da automação existir (só os dos últimos 7 dias)
export async function POST() {
  const { sb, user } = await requireUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const acc = await accountByUser(user.id);
  if (!acc) return NextResponse.json({ error: "Instagram não conectado" }, { status: 400 });

  const { data } = await sb.from("automations").select("*").eq("active", true);
  const autos = (data as Automation[]) ?? [];
  const report = { found: 0, sent: 0, tooOld: 0, alreadyReplied: 0, posts: 0 };

  const mediaIds = [...new Set(autos.flatMap((a) => a.post_ids))];
  for (const mediaId of mediaIds) {
    report.posts++;
    const comments = await listComments(acc.token, mediaId).catch(() => []);
    for (const c of comments) {
      const fromId = c.from?.id;
      if (!fromId || fromId === acc.ig_user_id) continue;
      const auto = autos.find((a) => a.post_ids.includes(mediaId) && matchesKeyword(c.text ?? "", a.keywords));
      if (!auto) continue;
      report.found++;
      if (c.replies?.data?.some((r) => r.from?.id === acc.ig_user_id)) { report.alreadyReplied++; continue; }
      if (Date.now() - new Date(c.timestamp).getTime() > SEVEN_DAYS) { report.tooOld++; continue; }
      // mesmo fluxo do webhook (deduplicado por comment_id)
      await handleComment(acc, { id: c.id, text: c.text, from: { id: fromId, username: c.from?.username ?? c.username }, media: { id: mediaId } });
      report.sent++;
    }
  }
  return NextResponse.json(report);
}
