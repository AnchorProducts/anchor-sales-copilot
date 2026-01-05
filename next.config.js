const withPWA = require("next-pwa")({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
});

/** @type {import('next').NextConfig} */
module.exports = withPWA({
  reactStrictMode: true,
  turbopack: {},

  async headers() {
    return [
      {
        source: "/manifest.webmanifest",
        headers: [
          {
            key: "Content-Type",
            value: "application/manifest+json",
          },
        ],
      },
    ];
  },
});

/** @type {import('next').NextConfig} */
module.exports = withPWA({
  reactStrictMode: true,

  // ✅ Tell Next "Turbopack is intentional"
  turbopack: {},
});
