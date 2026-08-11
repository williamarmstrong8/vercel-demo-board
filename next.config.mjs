import { withEve } from "eve/next"

/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // The board style skills are markdown read at runtime with `fs` (see
  // lib/boards/engine/skills.ts), so they have to be traced into the function
  // bundle explicitly — nothing imports them, and tracing only follows imports.
  outputFileTracingIncludes: {
    "/api/ai/build-board": ["./agent/skills/board-*/SKILL.md"],
  },
}

export default withEve(nextConfig)
