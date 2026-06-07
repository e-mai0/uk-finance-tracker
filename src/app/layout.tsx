import type { Metadata } from "next";
import { Libre_Franklin, JetBrains_Mono, Newsreader } from "next/font/google";
import "./globals.css";

// UI grotesque — Franklin Gothic lineage, an institutional / financial-press
// voice. (Variable kept as --font-geist-sans so the globals.css mapping stands.)
const sans = Libre_Franklin({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

// Finance-grade monospace for every numeric, code and the data grid. JetBrains
// Mono — tall x-height + open apertures stay legible at dense terminal sizes.
const mono = JetBrains_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

// Editorial display serif — marketing headlines only (incl. italic emphasis).
const display = Newsreader({
  variable: "--font-display",
  subsets: ["latin"],
  style: ["normal", "italic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Trackr — UK Finance Summer Internships",
  description:
    "A disciplined tracker for UK finance summer internships — browse openings, see personalized fit scores, and run a focused application workflow.",
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
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
