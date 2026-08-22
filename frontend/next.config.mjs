/** @type {import('next').NextConfig} */
const nextConfig = {
  // Salida standalone: permite ejecutar el frontend con `node server.js`
  // sin necesidad de node_modules completos ni de un servidor Node externo.
  // Es la base del empaquetado para testers (build_dist.py).
  output: "standalone",
};

export default nextConfig;
