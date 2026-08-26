import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @form/core ships raw TypeScript so the domain stays editable in place and
  // portable to a native app later; Next has to compile it.
  transpilePackages: ["@form/core"],
  reactStrictMode: true,
};

export default nextConfig;
