import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Northstar — Personal Life Guide",
    short_name: "Northstar",
    description:
      "Een actieve AI-coach voor impact, gezondheid en een beter leven.",
    start_url: "/",
    display: "standalone",
    background_color: "#f3f1e9",
    theme_color: "#11120f",
    orientation: "portrait",
    lang: "nl",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
