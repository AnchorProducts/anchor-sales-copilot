// src/app/layout.tsx
import "./globals.css";
import type { Metadata, Viewport } from "next";
import { isInternal, APP_NAME, APP_SHORT } from "@/lib/appMode";
import { MobileBottomNav } from "@/app/components/ui/MobileBottomNav";
import { HelpMenuButton } from "@/app/components/ui/HelpMenuButton";
import { MobileBackButton } from "@/app/components/ui/MobileBackButton";
import { AppSidebar } from "@/app/components/ui/AppSidebar";
import { UserEventTracker } from "@/app/components/UserEventTracker";
import { AdminViewAsSwitcher } from "@/app/components/admin/AdminViewAsSwitcher";
import { AppTutorial } from "@/app/components/tutorial/AppTutorial";
import { ProfileCompletionPrompt } from "@/app/components/ProfileCompletionPrompt";
import { InstallGate } from "@/app/components/InstallGate";
import { GATE_EXEMPT_PREFIXES, GATE_BYPASS_KEY, MOBILE_UA_PATTERN } from "@/lib/installGate";

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
        {/* Chrome fires beforeinstallprompt on load — often before React mounts.
            Stash it so InstallGate can offer one-tap install. */}
        <script dangerouslySetInnerHTML={{ __html: `
          window.addEventListener('beforeinstallprompt', function(e){
            e.preventDefault();
            window.__anchorInstallEvent = e;
            window.dispatchEvent(new Event('anchor:installable'));
          });
        `}} />
        {/* Flag a phone browser before first paint so the page underneath never
            flashes behind the install gate. The constants come from InstallGate
            itself, so the two can't drift apart; InstallGate clears the
            attribute once it decides not to render. */}
        <script dangerouslySetInnerHTML={{ __html: `
          (function(){
            try {
              var ua = navigator.userAgent;
              var mobile = /${MOBILE_UA_PATTERN}/i.test(ua) ||
                (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
              if (!mobile) return;
              if (window.matchMedia('(display-mode: standalone)').matches || navigator.standalone) return;
              if (sessionStorage.getItem(${JSON.stringify(GATE_BYPASS_KEY)}) === '1') return;
              var path = location.pathname;
              var exempt = ${JSON.stringify(GATE_EXEMPT_PREFIXES)};
              for (var i = 0; i < exempt.length; i++) {
                if (path === exempt[i] || path.indexOf(exempt[i] + '/') === 0) return;
              }
              document.documentElement.setAttribute('data-install-gate', '1');
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
        <HelpMenuButton />
        <ProfileCompletionPrompt />
        <InstallGate />
        <UserEventTracker />
      </body>
    </html>
  );
}
