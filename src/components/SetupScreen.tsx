import {
  ArrowRight,
  Check,
  ChevronRight,
  CircleHelp,
  Clock3,
  Play,
  Settings2,
  Shield,
  Sparkles,
  Swords,
  Users,
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
  fearless: boolean;
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
  savedMode: "standard" | "all-star" | "fearless";
};

const modes = [
  { id: "standard", label: "通常", icon: Swords },
  { id: "all-star", label: "オールスター", icon: Sparkles },
  { id: "fearless", label: "フィアレス", icon: Shield },
] as const;

export default function SetupScreen({
  values,
  onChange,
  onStart,
  onResume,
  onTools,
  hasSaved,
  progress,
  game,
  savedMode,
}: Props) {
  const selectedMode = !values.allStar
    ? "standard"
    : values.fearless
      ? "fearless"
      : "all-star";
  const savedModeName = modes.find((mode) => mode.id === savedMode)!.label;

  return (
    <main className="setup-main setup-refresh">
      <section className="setup-refresh-card" aria-labelledby="setup-title">
        <header className="setup-refresh-heading">
          <div>
            <h1 id="setup-title">ドラフトの準備</h1>

          </div>
          <div className="setup-portraits" aria-hidden="true">
            {["gengar", "pikachu", "megalucario"].map((id) => {
              const pokemon = byId.get(id);
              return pokemon ? (
                <span className={`setup-portrait ${pokemon.role}`} key={id}>
                  <Portrait p={pokemon} eager />
                </span>
              ) : null;
            })}
          </div>
        </header>

        {hasSaved && (
          <button type="button" className="setup-resume" onClick={onResume}>
            <span className="setup-resume-icon" aria-hidden="true">
              <Play size={20} fill="currentColor" />
            </span>
            <span className="setup-resume-copy">
              <strong>{progress === 16 ? "前回の結果" : "続きから再開"}</strong>
              <small>
                {savedModeName}
                {savedMode !== "standard" && ` · 第${game}試合`}
                {` · ${progress}/16`}
              </small>
            </span>
            <ChevronRight size={20} aria-hidden="true" />
          </button>
        )}

        <fieldset className="setup-choice-group">
          <legend>形式</legend>
          <div className="setup-mode-grid">
            {modes.map(({ id, label, icon: Icon }) => (
              <button
                type="button"
                key={id}
                className="setup-mode-choice"
                aria-pressed={selectedMode === id}
                aria-label={id === "standard" ? "通常ドラフト" : label}
                onClick={() =>
                  onChange({
                    ...values,
                    allStar: id !== "standard",
                    fearless: id === "fearless",
                  })
                }
              >
                <Icon size={24} aria-hidden="true" />
                <span>{label}</span>
                {selectedMode === id && (
                  <Check
                    className="setup-choice-check"
                    size={16}
                    aria-hidden="true"
                  />
                )}
              </button>
            ))}
          </div>
        </fieldset>

        {values.allStar && (
          <fieldset className="setup-choice-group">
            <legend>試合数</legend>
            <div className="setup-series-control">
              {([3, 5, 7] as const).map((bestOf) => (
                <button
                  type="button"
                  key={bestOf}
                  aria-pressed={values.bestOf === bestOf}
                  aria-label={`BO${bestOf}、${bestOf}試合`}
                  onClick={() => onChange({ ...values, bestOf })}
                >
                  BO{bestOf}
                </button>
              ))}
            </div>
          </fieldset>
        )}

        <div className="setup-settings-list">
          <div className="setup-timer-row">
            <span className="setup-row-label" id="setup-timer-label">
              <Clock3 size={20} aria-hidden="true" />
              制限時間
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={values.seconds > 0}
              aria-labelledby="setup-timer-label"
              className="setup-switch"
              onClick={() =>
                onChange({ ...values, seconds: values.seconds > 0 ? 0 : 30 })
              }
            >
              <span className="setup-switch-track" aria-hidden="true">
                <span className="setup-switch-thumb">
                  {values.seconds > 0 && <Check size={13} strokeWidth={3} />}
                </span>
              </span>
            </button>
          </div>

          <details className="setup-disclosure">
            <summary>
              <span className="setup-row-label">
                <Users size={20} aria-hidden="true" />
                チーム・トレーナー名
              </span>
              <ChevronRight
                className="setup-disclosure-arrow"
                size={18}
                aria-hidden="true"
              />
            </summary>
            <div className="setup-name-grid">
              {(["purple", "orange"] as const).map((team, teamIndex) => (
                <fieldset className={`setup-team-names ${team}`} key={team}>
                  <legend>{team === "purple" ? "パープル" : "オレンジ"}</legend>
                  <label>
                    チーム名
                    <input
                      type="text"
                      value={values[team]}
                      maxLength={20}
                      onChange={(event) =>
                        onChange({ ...values, [team]: event.target.value })
                      }
                    />
                  </label>
                  {values.trainers
                    .slice(teamIndex * 5, teamIndex * 5 + 5)
                    .map((trainer, slot) => (
                      <label key={slot}>
                        トレーナー {slot + 1}
                        <input
                          type="text"
                          value={trainer}
                          maxLength={20}
                          onChange={(event) => {
                            const trainers = [...values.trainers];
                            trainers[teamIndex * 5 + slot] = event.target.value;
                            onChange({ ...values, trainers });
                          }}
                        />
                      </label>
                    ))}
                </fieldset>
              ))}
            </div>
          </details>

          <button
            type="button"
            className="setup-settings-button"
            onClick={onTools}
            aria-label="その他の設定：プリセット・大会制限"
          >
            <span className="setup-row-label">
              <Settings2 size={20} aria-hidden="true" />
              その他の設定
            </span>
            <ChevronRight size={18} aria-hidden="true" />
          </button>

          <details className="setup-disclosure setup-rules">
            <summary>
              <span className="setup-row-label">
                <CircleHelp size={20} aria-hidden="true" />
                ルール
              </span>
              <ChevronRight
                className="setup-disclosure-arrow"
                size={18}
                aria-hidden="true"
              />
            </summary>
            <div className="setup-rules-content">
              <dl>
                <div>
                  <dt>通常</dt>
                  <dd>前の試合の選出を持ち越しません。</dd>
                </div>
                <div>
                  <dt>オールスター</dt>
                  <dd>
                    それまでの試合で両チームが選んだポケモンは、再使用できません。
                  </dd>
                </div>
                <div>
                  <dt>フィアレス（独自ルール）</dt>
                  <dd>
                    それまでの試合で自分のチームが選んだポケモンは、再使用できません。
                  </dd>
                </div>
                <div>
                  <dt>試合数</dt>
                  <dd>
                    BO3・BO5・BO7は、それぞれ3・5・7試合の選出で終了します。勝敗は記録しません。
                  </dd>
                </div>
                <div>
                  <dt>制限時間</dt>
                  <dd>
                    使用禁止は15秒、選択は20秒。使用禁止は時間切れでスキップします。
                  </dd>
                </div>
              </dl>
            </div>
          </details>
        </div>

        <div className="setup-start-area">
          <button
            type="button"
            className={`setup-start ${hasSaved ? "setup-start-secondary" : ""}`}
            onClick={onStart}
          >
            <span>{hasSaved ? "新しく開始" : "ドラフトを開始"}</span>
            <ArrowRight size={20} aria-hidden="true" />
          </button>
          {hasSaved && (
            <p className="setup-replace-note">
              保存中のドラフトを置き換えます。
            </p>
          )}
        </div>
      </section>
    </main>
  );
}


