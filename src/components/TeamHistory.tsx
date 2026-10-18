import type { PastGame, Team } from "../domain/draft";
import { byId } from "../data/roster";
import Portrait from "./Portrait";
import { useState } from "react";

export default function TeamHistory({
  team,
  name,
  history,
  active,
}: {
  team: Team;
  name: string;
  history: PastGame[];
  active: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [game, setGame] = useState(0);
  const current = Math.min(game, Math.max(0, history.length - 1));
  return (
    <aside
      className={`team-history ${team} ${active ? "turn-active" : ""}`}
      data-games={history.length}
      data-open={open}
      aria-label={`${name}の過去の選出`}
    >
      <button className="history-toggle" aria-expanded={open} aria-controls={`history-${team}`} onClick={() => setOpen(!open)}>
        {open ? "チームに戻る" : `選択済み ${history.length * 5}`}
      </button>
      <nav className="history-game-nav" aria-label={`${name}の履歴の試合切替`}>
        <button aria-label="前の試合の選択済み" disabled={current === 0} onClick={() => setGame(current - 1)}>‹</button>
        <span>第{history[current]?.game}試合</span>
        <button aria-label="次の試合の選択済み" disabled={current === history.length - 1} onClick={() => setGame(current + 1)}>›</button>
      </nav>
      <div className="history-heading">
        <strong>選択済</strong>
        <span>{history.length * 5}</span>
      </div>
      <div
        className="history-scroll"
        id={`history-${team}`}
        tabIndex={0}
        aria-label={`${name}の選択済ポケモン一覧`}
      >
        {history.length > 0 &&
          history.map((past, index) => (
            <section
              className="history-game"
              data-current={index === current}
              key={past.game}
              aria-label={`第${past.game}試合`}
            >
              <h3>第{past.game}試合</h3>
              <div className="history-pokemon">
                {past.picks
                  .filter((p) => p.team === team)
                  .map((pick) => {
                    const p = byId.get(pick.pokemon)!;
                    return (
                      <div
                        className="history-pokemon-item"
                        key={p.id}
                        title={`${p.name} · 第${past.game}試合で選択済`}
                      >
                        <Portrait p={p} />
                      </div>
                    );
                  })}
              </div>
            </section>
          ))}
      </div>
    </aside>
  );
}
