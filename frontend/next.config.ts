import type { NextConfig } from "next";

// Amplify Hosting's WEB_COMPUTE runtime does not forward app/branch
// environment variables into the deployed SSR Lambda's actual process
// environment (confirmed empirically — a runtime probe showed none of
// our custom vars present, only AWS/Lambda-reserved ones). Amplify DOES
// expose them during the build step, so `env` here bakes each value in
// as a literal at build time via Next.js's own static replacement,
// sidestepping the runtime gap entirely. See DECISIONS.md.
const nextConfig: NextConfig = {
  env: {
    USE_BEDROCK: process.env.USE_BEDROCK,
    TABLE_NAME: process.env.TABLE_NAME,
    BEDROCK_MODEL_ID: process.env.BEDROCK_MODEL_ID,
  },
};

export default nextConfig;
