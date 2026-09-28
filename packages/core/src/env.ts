// 저장소 루트의 .env 를 읽는다 (있을 때만). 앱 진입점에서 가장 먼저 import 한다.
//   import "@kb/core/env";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const envPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env");
if (existsSync(envPath)) process.loadEnvFile(envPath);
