import useSwipePages from "./useSwipePages";
import type { PastGame, Team } from "../domain/draft";
import { byId } from "../data/roster";
import Portrait from "./Portrait";
import { useLayoutEffect, useRef, useState } from "react";

export default function TeamHistory({team,name,history,active}: {
  team: Team; name: string; history: PastGame[]; active: boolean;
}) {
  const content = useRef<HTMLDivElement>(null);
  const [capacity,setCapacity] = useState(1);
  const [page,setPage] = useState(0);
  useLayoutEffect(() => {
    const element = content.current;
    if (!element) return;
    const measure = () => {
      // Reserve a whole five-pokemon game, including its heading and gaps.
      const height = element.clientHeight - 6;
      const icon = Math.min(42, Math.max(28, element.clientWidth - 8));
      setCapacity(Math.max(1, Math.floor((height + 6) / (16 + 5 * icon + 12 + 6))));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, []);
  const pages = Math.max(1,Math.ceil(history.length / capacity));
  const current = Math.min(page,pages-1);
  const swipe = useSwipePages(direction => setPage(Math.max(0, Math.min(pages - 1, current + direction))));
  return <aside className={`team-history ${team} ${active ? "turn-active" : ""}`} data-games={history.length} aria-label={`${name}の過去の選出`}>
    <div className="history-heading"><strong>選択済</strong><span>{history.length*5}</span></div>
    <div className="history-scroll" tabIndex={0} onKeyDown={e => { const direction = e.key === "PageDown" ? 1 : e.key === "PageUp" ? -1 : 0; if (direction) { e.preventDefault(); setPage(Math.max(0, Math.min(pages - 1, current + direction))); } }} {...swipe} ref={content} style={{ gridTemplateRows: `repeat(${capacity}, minmax(0, 1fr))` }} aria-label={`${name}の選択済ポケモン一覧`}>
      {history.slice(current*capacity,(current+1)*capacity).map(past =>
        <section className="history-game" key={past.game} aria-label={`第${past.game}試合`}>
          <h3>第{past.game}試合</h3>
          <div className="history-pokemon">{past.picks.filter(p=>p.team===team).map(pick=>{
            const p=byId.get(pick.pokemon)!;
            return <div className="history-pokemon-item" key={p.id} title={`${p.name} · 第${past.game}試合で選択済`}><Portrait p={p}/></div>;
          })}</div>
        </section>)}
    </div>
    <nav className="history-pagination" aria-label={`${name}の選択済ページ切替`}>
      <button aria-label="選択済の前のページ" disabled={current===0} onClick={()=>setPage(current-1)}>‹</button>
      <span aria-live="polite">{current+1} / {pages}</span>
      <button aria-label="選択済の次のページ" disabled={current===pages-1} onClick={()=>setPage(current+1)}>›</button>
    </nav>
  </aside>;
}




