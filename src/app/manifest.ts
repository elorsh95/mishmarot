import type { MetadataRoute } from "next";

/** Lets phones and computers install the app to the home screen (opens full screen). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "משמרות – סידור עבודה",
    short_name: "משמרות",
    description: "ניהול סידור עבודה שבועי למוקד",
    lang: "he",
    dir: "rtl",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#f5f6fa",
    theme_color: "#3b5bdb",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      { name: "סידור עבודה", url: "/schedule" },
      { name: "בקשות לאישור", url: "/approvals" },
    ],
  };
}
