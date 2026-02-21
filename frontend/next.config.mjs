// Отключить анонимную телеметрию Next.js (см. https://nextjs.org/telemetry)
if (process.env.NEXT_TELEMETRY_DISABLED === undefined) {
  process.env.NEXT_TELEMETRY_DISABLED = "1"
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
