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
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
