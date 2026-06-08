// src/app/layout.tsx
import "./globals.css";
import type { Metadata, Viewport } from "next";
import { isInternal, APP_NAME, APP_SHORT } from "@/lib/appMode";
import { MobileBottomNav } from "@/app/components/ui/MobileBottomNav";
import { MobileBackButton } from "@/app/components/ui/MobileBackButton";
import { AppSidebar } from "@/app/components/ui/AppSidebar";
import { UserEventTracker } from "@/app/components/UserEventTracker";
import { AdminViewAsSwitcher } from "@/app/components/admin/AdminViewAsSwitcher";
import { AppTutorial } from "@/app/components/tutorial/AppTutorial";
import { PageHelpButton } from "@/app/components/tutorial/PageHelpButton";
import { ProfileCompletionPrompt } from "@/app/components/ProfileCompletionPrompt";

export const metadata: Metadata = {
  title: {
    default: APP_NAME,
    template: `%s • ${APP_NAME}`,
  },
  description: isInternal
    ? "Internal sales tools — leads, assets, and reporting."
    : "Sales • Assets • Leads",

  appleWebApp: {
    capable: true,
    title: APP_SHORT,
    statusBarStyle: "black-translucent",
  },

  icons: {
    icon: "/favicon.ico",
    apple: isInternal ? "/internal_apple-touch-icon.png" : "/apple-touch-icon.png",
  },
};

// ✅ Required for iOS notch + PWA
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#047835",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Apply saved theme before first paint to prevent flash */}
        <script dangerouslySetInnerHTML={{ __html: `
          (function(){
            try {
              var t = localStorage.getItem('anchor-theme') || 'light';
              if (t === 'system') t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
              document.documentElement.setAttribute('data-theme', t);
              var l = localStorage.getItem('anchor-lang') || 'en';
              document.documentElement.setAttribute('lang', l);
            } catch(e){}
          })();
        `}} />
      </head>
      <body>
        <AppSidebar />
        {children}
        <MobileBackButton />
        <MobileBottomNav />
        <AdminViewAsSwitcher />
        <AppTutorial />
        <PageHelpButton />
        <ProfileCompletionPrompt />
        <UserEventTracker />
      </body>
    </html>
  );
}
