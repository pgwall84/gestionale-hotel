import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    // Dice a Turbopack che la root del progetto è questa cartella (frontend/),
    // evitando che rilevi il package-lock.json della root del monorepo (usato da Jest)
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
