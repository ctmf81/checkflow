import type { NextConfig } from "next";

// Headers de segurança — adicionados após pentest HTTP (2026-06-08) que
// detectou ausência de HSTS, X-Frame-Options/CSP frame-ancestors e
// X-Content-Type-Options no app Web (a API via Fastify/helmet já os tinha).
// CSP adicionado 2026-08-20 (pentest identificou ausência).
// Notas do CSP:
// - 'unsafe-inline'/'unsafe-eval' em script-src são exigidos pelo Next.js
//   (bootstrapping SSR + client-side hydration). Sem eles, a app quebra.
// - connect-src precisa permitir Supabase (REST+Realtime WS), API Railway,
//   Asaas (prod + sandbox), google fonts e o próprio host.
// - frame-ancestors 'self' equivale a X-Frame-Options: SAMEORIGIN (dupla defesa).
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "media-src 'self' data: blob:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.railway.app https://api.asaas.com https://api-sandbox.asaas.com",
  "worker-src 'self' blob:",
  "frame-ancestors 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Content-Security-Policy", value: csp },
];

const nextConfig: NextConfig = {
  // Não expor o banner de versão (X-Powered-By: Next.js) — info disclosure
  // apontada pelo pentest HTTP (pentest/http_probe.mjs).
  poweredByHeader: false,
  // URLs limpas para apresentações públicas (páginas de marketing estáticas
  // servidas de /public). O `.html` continua acessível como fallback.
  async rewrites() {
    return [
      { source: "/apresentacao_parceiro", destination: "/apresentacao_parceiro.html" },
      { source: "/conheca-checkflow", destination: "/conheca-checkflow.html" },
    ];
  },
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
