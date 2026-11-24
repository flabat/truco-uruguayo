import type { APIRoute } from "astro";
import sharp from "sharp";

export const GET: APIRoute = async () => {
  const png = await sharp("public/favicon.svg", { density: 216 })
    .resize(144, 144)
    .extend({ top: 18, bottom: 18, left: 18, right: 18, background: "#faf8f0" })
    .flatten({ background: "#faf8f0" })
    .png()
    .toBuffer();

  return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png" } });
};
