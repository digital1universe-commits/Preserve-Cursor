import type { Metadata } from "next";
import "@fontsource/barlow-condensed/latin-500.css";
import "@fontsource/barlow-condensed/latin-600.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/source-sans-3/latin-400.css";
import "@fontsource/source-sans-3/latin-600.css";
import "leaflet/dist/leaflet.css";
import "../src/client/styles.css";

export const metadata: Metadata = {
  title: "PRESERVE",
  description: "Secure multi-agency containment and search planning",
  icons: { icon: "/favicon.svg", apple: "/icon-192.png" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body>{children}</body>
    </html>
  );
}
