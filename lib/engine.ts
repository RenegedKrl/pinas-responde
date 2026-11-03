import { Client } from "@upstash/qstash";
import { accountByIgId } from "./accounts";
import { msg, replyToComment, sendMessage } from "./instagram";
import { supabaseAdmin } from "./supabase-server";
import { matchesKeyword, pick } from "./text";
import type { Automation, Step } from "./types";

type Account = NonNullable<Awaited<ReturnType<typeof accountByIgId>>>;

const PAYLOAD_PREFIX = "AUTO:";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function logEvent(
  userId: string, automationId: string | null, igsid: string | null, type: string, detail?: string
) {
  await supabaseAdmin().from("events").insert({
    user_id: userId, automation_id: automationId, igsid, type, detail: detail?.slice(0, 500),
  });
}

// true se for a primeira vez que vemos essa chave (evita duplicar envio)
async function firstTime(key: string) {
  const { error } = await supabaseAdmin().from("processed_events").insert({ key });
  return !error;
}

async function upsertContact(userId: string, igsid: string, patch: Record<string, unknown>) {
  await supabaseAdmin().from("contacts").upsert(
    { user_id: userId, igsid, last_interaction_at: new Date().toISOString(), ...patch },
    { onConflict: "user_id,igsid" }
  );
}

async function loadAutomation(id: string) {
  const { data } = await supabaseAdmin().from("automations").select("*").eq("id", id).maybeSingle();
  return data as Automation | null;
}

// ---------- Comentário recebido ----------
export async function handleComment(account: Account, value: any) {
  const commentId: string = value?.id;
  const text: string = value?.text ?? "";
  const fromId: string = value?.from?.id;
  const username: string | undefined = value?.from?.username;
  const mediaId: string | undefined = value?.media?.id;
  if (!commentId || !fromId) return;
  if (fromId === account.ig_user_id) return; // ignora as próprias respostas (evita loop)
  if (value?.parent_id) return;              // ignora respostas dentro de threads

  const { data: list } = await supabaseAdmin()
    .from("automations").select("*")
    .eq("user_id", account.user_id).eq("active", true)
    .order("created_at", { ascending: true });

  const automation = (list as Automation[] | null)?.find(
    (a) => (!a.post_ids.length || (mediaId && a.post_ids.includes(mediaId))) && matchesKeyword(text, a.keywords)
  );
  if (!automation) return;
  if (!(await firstTime(`comment:${commentId}`))) return;

  await upsertContact(account.user_id, fromId, {
    username, last_comment: text.slice(0, 300), last_automation_id: automation.id,
  });

  // 1) resposta pública
  const publicReply = pick(automation.comment_replies.filter(Boolean));
  if (publicReply) {
    try {
      await replyToComment(account.token, commentId, publicReply);
      await logEvent(account.user_id, automation.id, fromId, "comment_reply", publicReply);
    } catch (e: any) {
      await logEvent(account.user_id, automation.id, fromId, "error", `comment_reply: ${e.message}`);
    }
  }

  // 2) resposta privada (1 por comentário, até 7 dias)
  const welcome = automation.welcome_message?.trim() || "Oi! Vi seu comentário 😊";
  const recipient = { comment_id: commentId };
  try {
    if (automation.steps.length) {
      await sendMessage(account.token, account.ig_user_id, recipient,
        msg.buttonPostback(welcome, automation.button_label || "Quero receber", PAYLOAD_PREFIX + automation.id));
    } else {
      await sendMessage(account.token, account.ig_user_id, recipient, msg.text(welcome));
    }
    await logEvent(account.user_id, automation.id, fromId, "private_reply");
  } catch (e: any) {
    // fallback: alguns casos não aceitam botão na resposta privada
    try {
      await sendMessage(account.token, account.ig_user_id, recipient,
        msg.text(`${welcome}\n\nResponda esta mensagem para receber 👇`));
      await logEvent(account.user_id, automation.id, fromId, "private_reply", "fallback texto");
    } catch (e2: any) {
      await logEvent(account.user_id, automation.id, fromId, "error", `private_reply: ${e2.message}`);
    }
  }
}

// ---------- Mensagem / clique no direct ----------
export async function handleMessaging(account: Account, m: any) {
  const sender: string = m?.sender?.id;
  if (!sender || sender === account.ig_user_id) return;
  if (m.message?.is_echo) return;

  let automationId: string | null = null;
  const eventKey = m.message?.mid || m.postback?.mid || `${sender}:${m.timestamp}`;

  if (m.postback?.payload?.startsWith(PAYLOAD_PREFIX)) {
    automationId = m.postback.payload.slice(PAYLOAD_PREFIX.length);
  } else if (m.message?.quick_reply?.payload?.startsWith(PAYLOAD_PREFIX)) {
    automationId = m.message.quick_reply.payload.slice(PAYLOAD_PREFIX.length);
  } else if (m.message?.text) {
    // a pessoa respondeu em texto: entrega a última automação pendente dela
    const { data: c } = await supabaseAdmin().from("contacts").select("last_automation_id")
      .eq("user_id", account.user_id).eq("igsid", sender).maybeSingle();
    automationId = c?.last_automation_id ?? null;
  }
  if (!automationId) return;
  if (!(await firstTime(`msg:${eventKey}`))) return;
  // entrega só uma vez por pessoa por automação
  if (!(await firstTime(`deliver:${automationId}:${sender}`))) return;

  const automation = await loadAutomation(automationId);
  if (!automation || automation.user_id !== account.user_id) return;

  await upsertContact(account.user_id, sender, {});
  await logEvent(account.user_id, automation.id, sender, "click");
  await runSteps(account.ig_user_id, automation.id, sender, 0);
}

// ---------- Sequência ----------
function qstash() {
  return process.env.QSTASH_TOKEN ? new Client({ token: process.env.QSTASH_TOKEN }) : null;
}

function stepMessage(s: Step) {
  switch (s.type) {
    case "text": return s.text ? msg.text(s.text) : null;
    case "link":
      if (!s.url) return null;
      return msg.buttonUrl(s.text || "Aqui está 👇", s.label || "Abrir", s.url);
    case "image": case "video": case "audio":
      return s.url ? msg.media(s.type, s.url) : null;
    default: return null;
  }
}

export async function runSteps(igUserId: string, automationId: string, igsid: string, start: number) {
  const account = await accountByIgId(igUserId);
  const automation = await loadAutomation(automationId);
  if (!account || !automation) return;
  const steps = automation.steps;

  for (let i = start; i < steps.length; i++) {
    const s = steps[i];
    if (s.type === "wait") {
      const secs = Math.max(0, Math.min(Number(s.seconds) || 0, 86_400));
      const q = qstash();
      if (q && secs > 3) {
        // agenda o resto da sequência
        await q.publishJSON({
          url: `${process.env.APP_URL}/api/jobs/steps`,
          body: { igUserId, automationId, igsid, start: i + 1 },
          delay: secs,
        });
        return;
      }
      await sleep(Math.min(secs, 8) * 1000); // sem QStash: espera curta
      continue;
    }
    const m = stepMessage(s);
    if (!m) continue;
    try {
      await sendMessage(account.token, account.ig_user_id, { id: igsid }, m);
      await logEvent(account.user_id, automation.id, igsid, "step", s.type);
    } catch (e: any) {
      await logEvent(account.user_id, automation.id, igsid, "error", `step ${i} ${s.type}: ${e.message}`);
    }
  }
}
