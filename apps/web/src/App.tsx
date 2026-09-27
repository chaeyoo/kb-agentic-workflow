import { useEffect, useState } from "react";
import { api, getUser, setUser } from "./api.ts";
import { useRoute } from "./hooks.ts";
import { BoardPage } from "./pages/BoardPage.tsx";
import { PoliciesPage } from "./pages/PoliciesPage.tsx";
import { QaPage } from "./pages/QaPage.tsx";

export function App() {
  const [page = "qa", a, b] = useRoute();
  const [users, setUsers] = useState<{ name: string; role: string }[]>([]);
  const [user, setUserState] = useState(getUser());
  useEffect(() => { api.get<{ name: string; role: string }[]>("/users").then(setUsers); }, []);

  const nav = [["qa", "Q&A"], ["board", "보드"], ["policies", "정책서"]] as const;
  return (
    <div className="app">
      <header className="topbar">
        <strong>📘 정책 에이전트</strong>
        <nav>{nav.map(([id, label]) => <a key={id} href={`#/${id}`} className={page === id ? "active" : ""}>{label}</a>)}</nav>
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
      </main>
    </div>
  );
}
