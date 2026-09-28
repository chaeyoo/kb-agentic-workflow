// 파일 기반 저장소.
//
// 이 프로젝트는 데모/교재용이라 DB 대신 JSON 파일 하나(data/store.json)에 상태를 둔다.
// - 파일이 없으면 시드(seed/policies/*.md)로 초기화한다.
// - 쓰기는 service 서버 한 프로세스만 한다. mcp 서버는 service REST API 를 호출하므로 파일을 직접 만지지 않는다.
// - 쓰기는 임시 파일에 쓴 뒤 rename 해서, 중간에 죽어도 파일이 깨지지 않게 한다.
// - Render 같은 환경에서는 재배포 시 초기화된다 (의도된 동작: 데모는 늘 같은 시드에서 시작).
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  AgentRun, Comment, PolicyChangeProposal, PolicyDocument, PolicySection, QaSession, Ticket,
} from "./types.ts";
import { loadSeed } from "./seed/load.ts";

export interface StoreData {
  documents: PolicyDocument[];
  sections: PolicySection[];
  proposals: PolicyChangeProposal[];
  tickets: Ticket[];
  comments: Comment[];
  runs: AgentRun[];
  qaSessions: QaSession[];
  counters: Record<string, number>; // id 채번용 (T-1, P-1 ...)
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

export class FileStore {
  readonly path: string;
  data: StoreData;

  constructor(dataDir = process.env.DATA_DIR || join(repoRoot, "data")) {
    this.path = join(dataDir, "store.json");
    if (existsSync(this.path)) {
      try {
        this.data = JSON.parse(readFileSync(this.path, "utf8")) as StoreData;
      } catch (err) {
        // 파일이 깨졌으면 옆에 백업해 두고 시드로 다시 시작한다 (발표 중 서버가 안 뜨는 것보다 낫다)
        const backup = `${this.path}.broken-${Date.now()}`;
        renameSync(this.path, backup);
        console.error(`[store] ${this.path} 을(를) 읽을 수 없어 ${backup} 로 옮기고 시드로 초기화합니다: ${(err as Error).message}`);
        this.data = loadSeed();
        this.save();
      }
    } else {
      this.data = loadSeed();
      this.save();
    }
  }

  /** 상태를 바꾼 뒤 호출한다. */
  save(): void {
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    renameSync(tmp, this.path);
  }

  /** 접두어별 순번 id 발급: nextId("T") → "T-1", "T-2" ... */
  nextId(prefix: string): string {
    const n = (this.data.counters[prefix] ?? 0) + 1;
    this.data.counters[prefix] = n;
    return `${prefix}-${n}`;
  }

  /** 시드 상태로 되돌린다 (발표 리허설용). */
  reset(): void {
    // 실행/Q&A 번호는 이어서 쓴다. 번호가 다시 쓰이면 열려 있는 화면(#/qa/run-1)이
    // 같은 주소라 새 실행을 구독하지 않고 reset 전 실행을 계속 보여준다.
    const { run, qa } = this.data.counters;
    this.data = loadSeed();
    if (run) this.data.counters.run = run;
    if (qa) this.data.counters.qa = qa;
    this.save();
  }
}
