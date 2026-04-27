import type { MetadataRoute } from "next";
import { isInternal, APP_NAME, APP_SHORT } from "@/lib/appMode";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: APP_NAME,
    short_name: APP_SHORT,
    description: isInternal
      ? "Anchor Products internal sales tools — leads, assets, and reporting."
      : "Anchor Products sales assistant with instant docs, specs, installs, and downloads.",

    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#047835",
    theme_color: "#047835",

    icons: isInternal
      ? [
          { src: "/internal_icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/internal_icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/internal_icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          { src: "/internal_apple-touch-icon.png", sizes: "180x180", type: "image/png" },
        ]
      : [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          { src: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
        ],

    screenshots: isInternal
      ? [
          { src: "/internal_pwa-wide.png",   sizes: "1280x720", type: "image/png", form_factor: "wide" },
          { src: "/internal_pwa-narrow.png",  sizes: "750x1334", type: "image/png", form_factor: "narrow" },
        ]
      : [
          { src: "/pwa-wide.png",   sizes: "1280x720", type: "image/png", form_factor: "wide" },
          { src: "/pwa-narrow.png", sizes: "750x1334", type: "image/png", form_factor: "narrow" },
        ],
  };
}
