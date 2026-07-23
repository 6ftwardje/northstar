import type { Metadata, Viewport } from "next";
import { DM_Sans, Instrument_Serif } from "next/font/google";
import { PwaRegister } from "./pwa-register";
import "./globals.css";

const sans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
});

const serif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-serif",
});

export const metadata: Metadata = {
  title: "Northstar — Personal Life Guide",
  description: "Een actieve AI-coach voor impact, gezondheid en een beter leven.",
  applicationName: "Northstar",
  appleWebApp: {
    capable: true,
    title: "Northstar",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#11120f",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="nl">
      <body className={`${sans.variable} ${serif.variable}`}>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
