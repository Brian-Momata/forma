import type { Metadata, Viewport } from "next";
import { Archivo, Instrument_Sans } from "next/font/google";
import { ServiceWorkerRegistrar } from "@/components/service-worker";
import { ThemeSync } from "@/components/theme-sync";
import "./globals.css";

/**
 * Archivo carries the `wdth` axis the design leans on (104-118 across every
 * heading and numeral). A static fallback looks visibly wrong, so the variable
 * font is a hard requirement — see docs/ENGINEERING.md §7.
 */
const archivo = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-archivo",
  display: "swap",
});

const instrument = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument",
  display: "swap",
});

export const metadata: Metadata = {
  title: "FORM",
  description:
    "Workouts built for your situation — at home, at the gym, with whatever you have.",
  applicationName: "FORM",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "FORM" },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#08090B",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${archivo.variable} ${instrument.variable}`}>
      <body>
        <ThemeSync />
        <ServiceWorkerRegistrar />
        {children}
      </body>
    </html>
  );
}
