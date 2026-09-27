import { useEffect, useState } from "react";
import { subscribeRun, type RecordedEvent } from "./api.ts";

/** 실행 하나의 이벤트를 모은다. 진행 중이면 실시간으로 늘어난다. */
export function useRunEvents(runId: string | undefined) {
  const [events, setEvents] = useState<RecordedEvent[]>([]);
  useEffect(() => {
    setEvents([]);
    if (!runId) return;
    return subscribeRun(runId, (e) => setEvents((prev) => [...prev, e]));
  }, [runId]);
  const done = events.find((e) => e.type === "done");
  return { events, done: done?.type === "done" ? done : undefined };
}

/** 주기적으로 다시 불러오기 (보드처럼 에이전트가 바꾸는 화면용). */
export function usePolling<T>(load: () => Promise<T>, deps: unknown[], intervalMs = 2500) {
  const [data, setData] = useState<T>();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    const run = () => load().then((d) => alive && setData(d)).catch(() => {});
    run();
    const timer = setInterval(run, intervalMs);
    return () => { alive = false; clearInterval(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { data, refresh: () => setTick((t) => t + 1) };
}

/** location.hash 기반 라우팅. "#/board/T-4" → ["board", "T-4"] */
export function useRoute(): string[] {
  const parse = () => location.hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const on = () => setRoute(parse());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}

/**
 * 저장된 이벤트를 원래 시간 간격대로 다시 흘려보낸다 (화면 리플레이).
 * 긴 대기(모델 응답 대기 등)는 maxGapMs 로 잘라서 발표 중 지루하지 않게 한다.
 */
export function useReplay<T extends { t: number }>(source: T[], speed = 1, maxGapMs = 1500) {
  const [playing, setPlaying] = useState(false);
  const [count, setCount] = useState(source.length);
  useEffect(() => { setCount(source.length); setPlaying(false); }, [source]);
  useEffect(() => {
    if (!playing) return;
    if (count >= source.length) { setPlaying(false); return; }
    const gap = count === 0 ? 300 : Math.min(maxGapMs, source[count]!.t - source[count - 1]!.t) / speed;
    const timer = setTimeout(() => setCount((c) => c + 1), Math.max(0, gap));
    return () => clearTimeout(timer);
  }, [playing, count, source, speed, maxGapMs]);
  return {
    events: source.slice(0, count),
    playing,
    play: () => { setCount(0); setPlaying(true); },
    stop: () => { setPlaying(false); setCount(source.length); },
  };
}
