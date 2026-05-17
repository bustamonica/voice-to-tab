/** @type {import('next').NextConfig} */
const nextConfig = {
  // Static MP3 / model assets in /public are served as-is.
  // Disable image optimization since we don't use next/image.
  images: { unoptimized: true },
};

module.exports = nextConfig;
