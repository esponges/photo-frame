/** @type {import('next').NextConfig} */
export default {
  // sharp and ffmpeg-static ship native binaries and must not be bundled.
  serverExternalPackages: ["sharp", "ffmpeg-static"],
  // The video route spawns the ffmpeg binary, which file tracing cannot see.
  outputFileTracingIncludes: {
    // The real pnpm path, which is where ffmpeg-static resolves to. The symlinked
    // node_modules/ffmpeg-static path must not be listed: Vercel rejects the package.
    "/api/video/[id]": ["./node_modules/.pnpm/ffmpeg-static@*/node_modules/ffmpeg-static/ffmpeg"],
  },
};
