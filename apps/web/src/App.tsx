import { useEffect, useState } from "react";
import { api, getUser, setUser } from "./api.ts";
import { useRoute } from "./hooks.ts";
import { BoardPage } from "./pages/BoardPage.tsx";
import { InternalsPage } from "./pages/InternalsPage.tsx";
import { PoliciesPage } from "./pages/PoliciesPage.tsx";
import { QaPage } from "./pages/QaPage.tsx";

export function App() {
  const [page = "qa", a, b] = useRoute();
  const [users, setUsers] = useState<{ name: string; role: string }[]>([]);
  const [user, setUserState] = useState(getUser());
  const [health, setHealth] = useState<{ llmMode: string; model: string }>();
  useEffect(() => {
    api.get<{ name: string; role: string }[]>("/users").then(setUsers);
    api.get<{ llmMode: string; model: string }>("/health").then(setHealth).catch(() => {});
  }, []);

  const nav = [["qa", "Q&A"], ["board", "보드"], ["policies", "정책서"], ["internals", "Internals"]] as const;
  return (
    <div className="app">
      <header className="topbar">
        <strong>📘 정책 에이전트</strong>
        <nav>{nav.map(([id, label]) => <a key={id} href={`#/${id}`} className={page === id ? "active" : ""}>{label}</a>)}
          <a href="/slides.html" target="_blank" rel="noreferrer">발표 슬라이드 ↗</a>
        </nav>
        {health && (
          <span className={`badge mode-${health.llmMode}`} title={health.model}>
            {health.llmMode === "replay" ? "📼 REPLAY 모드" : `LIVE · ${health.model}`}
          </span>
        )}
        <label className="user">
          나는
          <select value={user} onChange={(e) => { setUser(e.target.value); setUserState(e.target.value); }}>
            {users.map((u) => <option key={u.name} value={u.name}>{u.name} · {u.role}</option>)}
          </select>
        </label>
      </header>
      <main>
        {page === "qa" && <QaPage runId={a} />}
        {page === "board" && <BoardPage ticketId={a} users={users} />}
        {page === "policies" && <PoliciesPage documentId={a} target={b} />}
        {page === "internals" && <InternalsPage tab={a} id={b} />}
      </main>
    </div>
  );
}
