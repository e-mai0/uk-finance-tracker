import type { Metadata } from "next";
import { Karla, Fragment_Mono, Zilla_Slab } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

// GB+ UI sans — humanist grotesque with quiet character (Granola's "Melange" role).
// Variable kept as --font-geist-sans so the globals.css mapping stands.
const sans = Karla({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  // 400 body · 500/600 the calm-title middle (hierarchy without shouting) · 700/800 earned emphasis
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

// GB+ data mono — single weight by design; the family has no bold and we never
// synthesize one. Emphasis in mono = color tier or size, never weight.
const mono = Fragment_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

// GB+ display slab — page titles, greetings, card heads.
const display = Zilla_Slab({
  variable: "--font-display-slab",
  subsets: ["latin"],
  weight: ["500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Cyclops — your application OS",
  description:
    "Cyclops tracks UK internship listings, drafts answers in your voice overnight, and brings you only the decisions that need you.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${sans.variable} ${mono.variable} ${display.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <div className="flex flex-1 flex-col">{children}</div>
        <Analytics />
      </body>
    </html>
  );
}
