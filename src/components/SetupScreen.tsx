import {
  ArrowLeftRight,
  ArrowRight,
  Check,
  ChevronRight,
  Clock3,
  Layers3,
  Play,
  Shield,
  Sparkles,
  Swords,
} from "lucide-react";
import type { Team } from "../domain/draft";
import { byId } from "../data/roster";
import Portrait from "./Portrait";

export type SetupValues = {
  purple: string;
  orange: string;
  seconds: number;
  sound: boolean;
  first: Team;
  allStar: boolean;
  bestOf: 3 | 5;
};
type Props = {
  values: SetupValues;
  onChange: (values: SetupValues) => void;
  onStart: () => void;
  onResume: () => void;
  hasSaved: boolean;
  progress: number;
  game: number;
  savedAllStar: boolean;
};
export default function SetupScreen({
  values,
  onChange,
  onStart,
  onResume,
  hasSaved,
  progress,
  game,
  savedAllStar,
}: Props) {
  return (
    <main className="setup-main">
      <section className="setup-intro">
        <span className="section-kicker">
          <span /> YOUR DRAFT ROOM
        </span>
        <h1>
          チームの可能性を、
          <br />
          <span>この選択から。</span>
        </h1>
        <p>
          大会と同じ順番で、BANからPICKまで。
          <br />
          ひとつの画面で、両チームの選出を練習できます。
        </p>
        <div className="setup-art" aria-hidden="true">
          <div className="art-orbit" />
          {["gengar", "pikachu", "megalucario"].map((id, i) => (
            <div key={id} className={`showcase-card showcase-${i}`}>
              <span className="showcase-index">0{i + 1}</span>
              <Portrait p={byId.get(id)!} eager />
              <span className="showcase-name">{byId.get(id)!.name}</span>
            </div>
          ))}
          <span className="art-badge">
            <Swords size={15} />3 BAN · 5 PICK
          </span>
        </div>
        <div className="setup-features">
          <span>
            <Shield size={16} />
            大会形式に対応
          </span>
          <span>
            <Layers3 size={16} />
            99体のポケモン
          </span>
        </div>
      </section>
      <section className="setup-card" aria-labelledby="setup-title">
        <div className="setup-title-row">
          <div>
            <span className="section-kicker">MATCH SETUP</span>
            <h2 id="setup-title">ドラフトの準備</h2>
          </div>
          <span className="setup-symbol">
            <Swords size={23} />
          </span>
        </div>
        {hasSaved && (
          <button className="resume-card" onClick={onResume}>
            <span className="resume-icon">
              <Play size={17} fill="currentColor" />
            </span>
            <span>
              <strong>
                {progress === 16 ? "前回の結果を見る" : "続きから再開"}
              </strong>
              <small>
                {savedAllStar
                  ? `オールスター · GAME ${String(game).padStart(2, "0")} · `
                  : "通常ドラフト · "}
                {progress} / 16 選択済み
              </small>
            </span>
            <ChevronRight size={20} />
          </button>
        )}
        <fieldset className="setup-field">
          <legend>ドラフト形式</legend>
          <div className="mode-options">
            <button
              className={`mode-option ${!values.allStar ? "chosen" : ""}`}
              type="button"
              aria-pressed={!values.allStar}
              onClick={() => onChange({ ...values, allStar: false })}
            >
              <Swords size={21} />
              <strong>通常ドラフト</strong>
              <small>1試合ずつ自由に選出</small>
              {!values.allStar && <Check className="option-check" size={15} />}
            </button>
            <button
              className={`mode-option ${values.allStar ? "chosen" : ""}`}
              type="button"
              aria-pressed={values.allStar}
              onClick={() => onChange({ ...values, allStar: true })}
            >
              <Sparkles size={21} />
              <strong>オールスター</strong>
              <small>過去の選出を持ち越して禁止</small>
              {values.allStar && <Check className="option-check" size={15} />}
            </button>
          </div>
        </fieldset>
        <fieldset className="setup-field">
          <legend>試合形式</legend>
          <div className="match-format-panels">
            <div
              className="match-format-panel"
              aria-hidden={values.allStar}
              inert={values.allStar}
            >
              <div className="single-match-format">
                <strong>1試合完結</strong>
                <small>毎試合、新しいドラフト</small>
              </div>
              <p className="field-hint">
                前の試合の選出を持ち越さず、何度でも遊べます。
              </p>
            </div>
            <div
              className="match-format-panel"
              aria-hidden={!values.allStar}
              inert={!values.allStar}
            >
              <div className="timer-options series-options">
                {([3, 5] as const).map((bestOf) => (
                  <button
                    key={bestOf}
                    aria-pressed={values.bestOf === bestOf}
                    className={values.bestOf === bestOf ? "chosen" : ""}
                    onClick={() => onChange({ ...values, bestOf })}
                  >
                    BO{bestOf}
                    <small>最大{bestOf}試合</small>
                  </button>
                ))}
              </div>
              <p className="field-hint">
                第{values.bestOf}
                試合の選出で終了します。勝敗の記録は行いません。
              </p>
            </div>
          </div>
        </fieldset>
        <fieldset className="setup-field">
          <legend>
            <Clock3 size={15} />
            ターンの制限時間
          </legend>
          <div className="timer-options">
            {[0, 20, 30, 45, 60].map((seconds) => (
              <button
                type="button"
                key={seconds}
                className={values.seconds === seconds ? "chosen" : ""}
                aria-pressed={values.seconds === seconds}
                onClick={() => onChange({ ...values, seconds })}
              >
                {seconds === 0 ? (
                  "なし"
                ) : (
                  <>
                    {seconds}
                    <small>秒</small>
                  </>
                )}
              </button>
            ))}
          </div>
          <p className="field-hint">時間切れでも、選択は手動で確定できます。</p>
        </fieldset>
        <fieldset className="setup-field first-team-field">
          <legend>
            <ArrowLeftRight size={15} />
            先攻チーム
          </legend>
          <div className="side-options">
            {(["purple", "orange"] as Team[]).map((team) => (
              <button
                type="button"
                key={team}
                className={`${team} ${values.first === team ? "chosen" : ""}`}
                aria-pressed={values.first === team}
                onClick={() => onChange({ ...values, first: team })}
              >
                <span className="side-dot" />
                <span>
                  {team === "purple" ? "左側" : "右側"}
                  <small>{team === "purple" ? "パープル" : "オレンジ"}</small>
                </span>
                {values.first === team && <Check size={16} />}
              </button>
            ))}
          </div>
        </fieldset>
        <details className="team-name-settings">
          <summary>
            チーム名を変更
            <ChevronRight size={14} />
          </summary>
          <div>
            <label>
              左側のチーム
              <input
                value={values.purple}
                maxLength={20}
                onChange={(e) =>
                  onChange({ ...values, purple: e.target.value })
                }
              />
            </label>
            <label>
              右側のチーム
              <input
                value={values.orange}
                maxLength={20}
                onChange={(e) =>
                  onChange({ ...values, orange: e.target.value })
                }
              />
            </label>
          </div>
        </details>
        <button className="start-draft-button" onClick={onStart}>
          <span>{hasSaved ? "新しいドラフトを開始" : "ドラフトを開始"}</span>
          <ArrowRight size={19} />
        </button>
        <p className="setup-footnote">
          {hasSaved
            ? "新しく開始すると、保存中のドラフトを置き換えます。"
            : (values.first === "purple" ? "左側" : "右側") +
              "のチームが先攻。準備ができたら開始しましょう。"}
        </p>
      </section>
    </main>
  );
}
