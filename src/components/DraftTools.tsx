import { useState } from "react";
import { pokemon, normalize } from "../data/roster";
import { PRESETS_KEY, readPresets } from "../domain/backup";
import type { SetupValues } from "./SetupScreen";

export default function DraftTools({
  values,
  onChange,
  restricted,
  onRestricted,
  onExport,
  onImport,
  report,
}: {
  values: SetupValues;
  onChange: (v: SetupValues) => void;
  restricted: string[];
  onRestricted: (ids: string[]) => void;
  onExport: () => void;
  onImport: (file: File) => void;
  report: (message: string) => void;
}) {
  const [presets, setPresets] = useState(readPresets);
  const [query, setQuery] = useState("");
  const save = (team: "purple" | "orange") => {
    const entry = {
      name: values[team].trim() || "チーム",
      team: values[team],
      trainers: values.trainers.slice(
        team === "purple" ? 0 : 5,
        team === "purple" ? 5 : 10,
      ),
    };
    const next = [...presets.filter((p) => p.name !== entry.name), entry].slice(
      -30,
    );
    try {
      localStorage.setItem(PRESETS_KEY, JSON.stringify(next));
      setPresets(next);
      report("チーム設定を保存しました。");
    } catch {
      report("チーム設定を保存できませんでした。");
    }
  };
  return (
    <div className="draft-tools">
      <section>
        <h3>チーム設定プリセット</h3>
        <p>
          準備画面で入力したチーム名と5人のトレーナー名を保存します。同じ名前は上書きします。
        </p>
        <div className="tools-actions">
          <button onClick={() => save("purple")}>左チームを保存</button>
          <button onClick={() => save("orange")}>右チームを保存</button>
        </div>
        {presets.map((p, i) => (
          <div className="preset-row" key={p.name}>
            <strong>{p.name}</strong>
            {(["purple", "orange"] as const).map((team) => (
              <button
                key={team}
                onClick={() => {
                  const trainers = [...values.trainers];
                  trainers.splice(team === "purple" ? 0 : 5, 5, ...p.trainers);
                  onChange({ ...values, [team]: p.team, trainers });
                  report("準備画面にチーム設定を反映しました。");
                }}
              >
                {team === "purple" ? "左に適用" : "右に適用"}
              </button>
            ))}
            <button
              aria-label={p.name + "のプリセットを削除"}
              onClick={() => {
                const next = presets.filter((_, n) => n !== i);
                try {
                  localStorage.setItem(PRESETS_KEY, JSON.stringify(next));
                  setPresets(next);
                } catch {
                  report("削除できませんでした。");
                }
              }}
            >
              削除
            </button>
          </div>
        ))}
      </section>
      <section>
        <h3>大会の使用不可ポケモン · {restricted.length}匹</h3>
        <p>
          新しく開始するドラフトの使用禁止・選択候補から除外します。進行中の試合は変更しません。
        </p>
        <input
          type="search"
          aria-label="大会制限のポケモンを検索"
          placeholder="ポケモン名で検索"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="restriction-list">
          {pokemon
            .filter((p) => normalize(p.name).includes(normalize(query)))
            .map((p) => (
              <label key={p.id}>
                <input
                  type="checkbox"
                  checked={restricted.includes(p.id)}
                  onChange={(e) =>
                    onRestricted(
                      e.target.checked
                        ? [...restricted, p.id]
                        : restricted.filter((id) => id !== p.id),
                    )
                  }
                />
                {p.name}
              </label>
            ))}
        </div>
        <button onClick={() => onRestricted([])} disabled={!restricted.length}>
          制限をすべて解除
        </button>
      </section>
      <section>
        <h3>バックアップ</h3>
        <p>
          現在の進行状況・試合履歴・保存済み設定・プリセットを保存します。準備画面の未確定の変更は含みません。
        </p>
        <div className="tools-actions">
          <button onClick={onExport}>バックアップを保存</button>
          <label className="import-backup">
            バックアップを読み込む
            <input
              type="file"
              accept=".json,application/json"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onImport(file);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      </section>
    </div>
  );
}
