import { decrypt } from "./crypto";
import { supabaseAdmin } from "./supabase-server";

export async function accountByIgId(igUserId: string) {
  const { data } = await supabaseAdmin()
    .from("ig_accounts").select("*").eq("ig_user_id", igUserId).maybeSingle();
  if (!data) return null;
  return { ...data, token: decrypt(data.access_token) as string };
}

export async function accountByUser(userId: string) {
  const { data } = await supabaseAdmin()
    .from("ig_accounts").select("*").eq("user_id", userId).maybeSingle();
  if (!data) return null;
  return { ...data, token: decrypt(data.access_token) as string };
}
