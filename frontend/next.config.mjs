/** @type {import('next').NextConfig} */
const nextConfig = {
  // Salida standalone: solo para el empaquetado de escritorio (PyInstaller/build_dist.py),
  // que la activa vía la variable NEXT_STANDALONE=1.
  // En Vercel NO debe activarse: usa el output por defecto de Next.js y evita
  // conflictos con el pipeline de build de Vercel.
  ...(process.env.NEXT_STANDALONE === "1" ? { output: "standalone" } : {}),
};

export default nextConfig;
