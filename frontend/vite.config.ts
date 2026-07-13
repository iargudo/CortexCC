import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";
import { componentTagger } from "lovable-tagger";

const asteriskKey = path.resolve(__dirname, "../deploy/asterisk/keys/asterisk.key");
const asteriskCert = path.resolve(__dirname, "../deploy/asterisk/keys/asterisk.pem");
const devHttps =
  fs.existsSync(asteriskKey) && fs.existsSync(asteriskCert)
    ? {
        key: fs.readFileSync(asteriskKey),
        cert: fs.readFileSync(asteriskCert),
      }
    : undefined;

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8087,
    https: devHttps,
    proxy: devHttps
      ? {
          "/api": { target: "http://127.0.0.1:3037", changeOrigin: true },
          "/socket.io": { target: "http://127.0.0.1:3037", ws: true, changeOrigin: true },
        }
      : undefined,
    hmr: devHttps ? { protocol: "wss", host: "localhost" } : { overlay: false },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
}));
