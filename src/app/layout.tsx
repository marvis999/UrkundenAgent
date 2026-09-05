import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import type { ReactNode } from "react";
import { workspace } from "@/data/workspace";
import "./globals.css";

const sans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-sans" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono" });

/**
 * Every page reads the local store, so none of them may be prerendered at build time:
 * a case list baked into the build would keep showing the state the build saw.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: workspace.productName,
  description: "Agentische Zuarbeit für Immobilienkaufverträge",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="de" className={[sans.variable, mono.variable].join(" ")}>
      <body>{children}</body>
    </html>
  );
}
