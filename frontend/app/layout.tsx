import type { Metadata } from "next";
import { Inter, Lora, Noto_Sans_Tamil } from "next/font/google";
import "./globals.css";

const ui = Inter({
  variable: "--font-ui",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const poem = Lora({
  variable: "--font-poem",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
});

// Lora has no Tamil glyphs — Tamil stanza text needs its own font or it
// renders as boxes.
const tamil = Noto_Sans_Tamil({
  variable: "--font-tamil",
  subsets: ["tamil"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Tinai Poet",
  description: "A Sangam Tamil poetry engine — modern situations, classical landscapes.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${ui.variable} ${poem.variable} ${tamil.variable}`}>
      <body>{children}</body>
    </html>
  );
}
