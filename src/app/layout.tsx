import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { PORT } from "@/lib/port";

export const metadata: Metadata = {
  title: "PortWatch — Porto di Termini Imerese",
  description:
    "Monitoraggio AIS in tempo reale e preparazione delle operazioni doganali per il porto di Termini Imerese (ITTRI).",
};

export const viewport: Viewport = {
  themeColor: "#05090e",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body>
        <AppShell portName={PORT.shortName}>{children}</AppShell>
      </body>
    </html>
  );
}
