import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["firebase-admin", "exceljs"],
  experimental: {
    // Agents import files (up to 2MB, checked in the action) are sent to a server action.
    serverActions: { bodySizeLimit: "3mb" },
  },
};

export default nextConfig;
