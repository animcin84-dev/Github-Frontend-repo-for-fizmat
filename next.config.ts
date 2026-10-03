import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  logging: {
    // OAuth codes and webhook verification tokens must stay out of request logs.
    incomingRequests: { ignore: [/^\/api\/integrations\/gmail\/callback(?:\?|$)/, /^\/api\/integrations\/whatsapp\/webhook(?:\?|$)/] },
  },
};

export default nextConfig;
