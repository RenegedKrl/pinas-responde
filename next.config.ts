import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  images: { unoptimized: true },
  // /m/... = arquivos do Storage servidos pelo nosso domínio (TikTok exige domínio verificado)
  async rewrites() {
    return [{ source: "/m/:path*", destination: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/media/:path*` }];
  },
};
export default nextConfig;
