import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

// Cliente com a sessão do usuário logado (respeita RLS)
export async function supabaseUser() {
  const store = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (list: { name: string; value: string; options?: any }[]) => {
          try {
            list.forEach(({ name, value, options }) => store.set(name, value, options));
          } catch {
            // chamado em Server Component: o middleware renova a sessão
          }
        },
      },
    }
  );
}

// Cliente admin (ignora RLS). Só no servidor: webhook, cron, jobs.
export function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function requireUser() {
  const sb = await supabaseUser();
  const { data } = await sb.auth.getUser();
  return { sb, user: data.user };
}
