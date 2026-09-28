// pnpm seed:reset — data/store.json 을 시드 상태로 되돌린다. (service 서버를 끈 상태에서 실행)
import { FileStore } from "../store.ts";

const store = new FileStore();
store.reset();
console.log(`시드로 초기화했습니다: ${store.path}`);
