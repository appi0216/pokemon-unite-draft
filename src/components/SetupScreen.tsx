import {
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
import type { BestOf } from "../domain/draft";
import { byId } from "../data/roster";
import Portrait from "./Portrait";

export type SetupValues = {
  purple: string;
  orange: string;
  seconds: number;
  sound: boolean;
  trainers: string[];
  allStar: boolean;
  bestOf: BestOf;
};
type Props = {
  values: SetupValues;
  onChange: (values: SetupValues) => void;
  onStart: () => void;
  onResume: () => void;
  onTools: () => void;
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
  onTools,
  hasSaved,
  progress,
  game,
  savedAllStar,
}: Props) {
  return (
    <main className="setup-main">
      <section className="setup-intro">
        <span className="section-kicker">YOUR DRAFT ROOM</span>
        <h1>
          勝負は、
          <br />
          <span>選ぶ瞬間から。</span>
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
              <div className="showcase-image">
                <Portrait p={byId.get(id)!} eager />
              </div>
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
        <div className="setup-fields-grid">
          <fieldset className="setup-field draft-format-field">
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
                {!values.allStar && (
                  <Check className="option-check" size={15} />
                )}
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
          <fieldset className="setup-field match-format-field">
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
                  {([3, 5, 7] as const).map((bestOf) => (
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
          <fieldset className="setup-field timer-field">
            <legend>
              <Clock3 size={15} />
              ターンの制限時間
            </legend>
            <div className="timer-options">
              {[0, 30].map((seconds) => (
                <button
                  type="button"
                  key={seconds}
                  className={values.seconds > 0 === seconds > 0 ? "chosen" : ""}
                  aria-pressed={values.seconds > 0 === seconds > 0}
                  onClick={() => onChange({ ...values, seconds })}
                >
                  {seconds === 0 ? "なし" : "あり"}
                </button>
              ))}
            </div>
            <p className="field-hint">
              あり：BANは各15秒で自動スキップ、PICKは各ターン20秒です。
            </p>
          </fieldset>
        </div>
        <details className="team-name-settings">
          <summary>
            チーム・Trainer名を変更
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
            <div className="trainer-name-settings">
              {values.trainers.map((trainer, index) => (
                <label key={index}>
                  Trainer {index + 1}
                  <input
                    value={trainer}
                    maxLength={20}
                    onChange={(e) => {
                      const trainers = [...values.trainers];
                      trainers[index] = e.target.value;
                      onChange({ ...values, trainers });
                    }}
                  />
                </label>
              ))}
            </div>
          </div>
        </details>
        <button className="setup-tools-button" onClick={onTools}>
          プリセット・大会制限・バックアップ
        </button>
        <button className="start-draft-button" onClick={onStart}>
          <span>{hasSaved ? "新しいドラフトを開始" : "ドラフトを開始"}</span>
          <ArrowRight size={19} />
        </button>
        <p className="setup-footnote">
          {hasSaved
            ? "新しく開始すると、保存中のドラフトを置き換えます。"
            : "開始時に、この試合の先攻チームを選択します。"}
        </p>
      </section>
    </main>
  );
}
