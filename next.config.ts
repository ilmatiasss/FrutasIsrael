import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // el esquema SQL se lee en el servidor al instalar: incluirlo en el despliegue
  outputFileTracingIncludes: { "/api/instalar": ["./db/schema.sql"] },
};

export default nextConfig;
