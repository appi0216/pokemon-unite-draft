import { History } from "lucide-react";
import type { PastGame, Team } from "../domain/draft";
import { byId } from "../data/roster";
import Portrait from "./Portrait";

export default function TeamHistory({
  team,
  name,
  history,
  active,
  onReview,
}: {
  team: Team;
  name: string;
  history: PastGame[];
  active: boolean;
  onReview: (game: PastGame) => void;
}) {
  return (
    <aside
      className={`team-history ${team} ${active ? "turn-active" : ""}`}
      aria-label={`${name}の過去の選出`}
    >
      <div className="history-heading">
        <History size={13} />
        <strong>選択済</strong>
        <span>{history.length * 5}</span>
      </div>
      <div
        className="history-scroll"
        tabIndex={0}
        aria-label={`${name}の選択済ポケモン一覧`}
      >
        {history.length > 0 &&
          history.map((past) => (
            <section
              className="history-game"
              key={past.game}
              aria-label={`GAME ${past.game}`}
            >
              <button
                type="button"
                className="history-game-button"
                onClick={() => onReview(past)}
              >
                GAME {String(past.game).padStart(2, "0")}
              </button>
              <div className="history-pokemon">
                {past.picks
                  .filter((p) => p.team === team)
                  .map((pick) => {
                    const p = byId.get(pick.pokemon)!;
                    return (
                      <div
                        className="history-pokemon-item"
                        key={p.id}
                        title={`${p.name} · GAME ${past.game}で選択済`}
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
