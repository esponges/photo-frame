/** @type {import('next').NextConfig} */
export default {
  // sharp runs in the Node runtime, never the edge.
  serverExternalPackages: ["sharp"],
};
