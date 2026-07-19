import type { NextConfig } from "next";

// Headers de segurança — adicionados após pentest HTTP (2026-06-08) que
// detectou ausência de HSTS, X-Frame-Options/CSP frame-ancestors e
// X-Content-Type-Options no app Web (a API via Fastify/helmet já os tinha).
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

const nextConfig: NextConfig = {
  // Não expor o banner de versão (X-Powered-By: Next.js) — info disclosure
  // apontada pelo pentest HTTP (pentest/http_probe.mjs).
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      {
        // Service worker do PWA: nunca cachear o próprio sw.js, para que
        // atualizações cheguem ao usuário na próxima visita.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
