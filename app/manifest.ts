import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ClickOut Employee",
    short_name: "ClickOut",
    description: "ClickOut Employee Self-Service Mobile Application",
    start_url: "/employee",
    scope: "/employee/",
    display: "standalone",
    background_color: "#0f172a",
    theme_color: "#3b82f6",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
