"use client";
import { useRouter } from "next/navigation";

export default function DisconnectButton() {
  const router = useRouter();
  return (
    <button className="btn btn-sm btn-danger" onClick={async () => {
      await fetch("/api/instagram/disconnect", { method: "POST" });
      router.refresh();
    }}>Desconectar</button>
  );
}
