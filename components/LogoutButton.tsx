"use client";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";

export default function LogoutButton() {
  const router = useRouter();
  return (
    <button className="btn btn-sm" style={{ margin: "8px 12px" }} onClick={async () => {
      await supabaseBrowser().auth.signOut();
      router.replace("/login"); router.refresh();
    }}>Sair</button>
  );
}
