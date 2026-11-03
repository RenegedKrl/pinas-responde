import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pinas Responde",
  description: "Respostas automáticas para comentários e direct do Instagram",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
