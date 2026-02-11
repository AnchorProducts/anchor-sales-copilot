// src/app/layout.tsx
import "./globals.css";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: {
    default: "Anchor Sales Co-Pilot",
    template: "%s • Anchor Sales Co-Pilot",
  },
  description: "Docs • Specs • Install • Downloads",

  // ✅ This controls mobile browser + PWA status bar color
  themeColor: "#047835",

  // ✅ Proper Apple PWA config
  appleWebApp: {
    capable: true,
    title: "Anchor Co-Pilot",
    statusBarStyle: "black-translucent",
  },

  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
};

// ✅ Required for iOS notch + PWA
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
