import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "BG Tournament",
  description: "Ranking del torneo de juegos de mesa",
};
export const viewport: Viewport = { themeColor: "#12141c" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={geist.variable}>
      <body>{children}</body>
    </html>
  );
}
