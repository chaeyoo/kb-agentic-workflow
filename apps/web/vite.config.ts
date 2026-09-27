// 개발: vite(5173)가 /api 를 service(8787)로 프록시한다.
// 운영: `pnpm --filter @kb/web build` 결과(dist)를 service 서버가 정적 파일로 서빙한다. → 서버는 service 하나.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const service = process.env.SERVICE_URL || `http://localhost:${process.env.SERVICE_PORT || 8787}`;

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { "/api": service } },
});
