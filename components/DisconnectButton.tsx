"use client";
import { useRouter } from "next/navigation";

export default function DisconnectButton({ api = "/api/instagram/disconnect" }: { api?: string }) {
  const router = useRouter();
  return (
    <button className="btn btn-sm btn-danger" onClick={async () => {
      await fetch(api, { method: "POST" });
      router.refresh();
    }}>Desconectar</button>
  );
}
