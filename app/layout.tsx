import type { Metadata, Viewport } from "next";
import { PwaRegister } from "./pwa-register";
import "./globals.css";

export const metadata: Metadata = {
  title: "Northstar — Personal Life Guide",
  description: "Een actieve AI-coach voor impact, gezondheid en een beter leven.",
  applicationName: "Northstar",
  appleWebApp: {
    capable: true,
    title: "Northstar",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#f5f5f7",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="nl">
      <body>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
