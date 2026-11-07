import { SpeedInsights } from "@vercel/speed-insights/next";
import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, Geist_Mono, Inter } from "next/font/google";
import { Providers } from "@/components/providers";
import { cn } from "@/lib/utils";
import "./globals.css";

const barlowCondensed = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-display",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

// Only small secondary text uses the mono face: let it load lazily rather than preload.
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  preload: false,
});

export const metadata: Metadata = {
  title: { default: "Kicklight", template: "%s · Kicklight" },
  description:
    "Your Hue strip follows the match. Live football stats, goals and cards on the lights behind your TV.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#000000",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={cn(
        "dark h-full antialiased",
        inter.variable,
        geistMono.variable,
        barlowCondensed.variable,
        "font-sans",
      )}
    >
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
        <SpeedInsights />
      </body>
    </html>
  );
}
