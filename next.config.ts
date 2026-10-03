import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  logging: {
    // OAuth callback query strings contain short-lived authorization codes.
    incomingRequests: { ignore: [/^\/api\/integrations\/gmail\/callback(?:\?|$)/] },
  },
};

export default nextConfig;
