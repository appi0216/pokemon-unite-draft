import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import Portrait from "./components/Portrait";
import SetupScreen from "./components/SetupScreen";
import {
  ArrowLeftRight,
  ArrowRight,
  Ban,
  Check,
  CheckCheck,
  ChevronDown,
  CircleHelp,
  Clock3,
  Download,
  Expand,
  Flag,
  Grid2X2,
  Info,
  Pause,
  Play,
  RotateCcw,
  Search,
  House,
  Shield,
  SkipForward,
  Swords,
  Trophy,
  Undo2,
  UserRound,
  Volume2,
  VolumeX,
  Wifi,
  X,
  Zap,
} from "lucide-react";
import { byId, ids, normalize, pokemon, roles } from "./data/roster";
import type { Role } from "./data/roster";
import {
  choose,
  createDraft,
  currentStep,
  nextGame,
  restoreDraft,
  steps,
  swap,
  unavailable,
  undo,
} from "./domain/draft";
import type { Draft, Team } from "./domain/draft";

const STORAGE = "unite-draft.v1";
type Settings = {
  purple: string;
  orange: string;
  seconds: number;
  sound: boolean;
};
const defaults: Settings = {
  purple: "パープルチーム",
  orange: "オレンジチーム",
  seconds: 30,
  sound: false,
};
function load() {
  try {
    const v = JSON.parse(localStorage.getItem(STORAGE) || "null");
    const draft = restoreDraft(v?.draft, ids);
    const s = v?.settings;
    return {
      draft: draft || createDraft(),
      settings:
        s &&
        typeof s.purple === "string" &&
        typeof s.orange === "string" &&
        [0, 20, 30, 45, 60].includes(s.seconds) &&
        typeof s.sound === "boolean"
          ? (s as Settings)
          : defaults,
    };
  } catch {
    return { draft: createDraft(), settings: defaults };
  }
}
function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        <button className="icon-button" onClick={onClose} aria-label="閉じる">
          <X />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function App() {
  const [initial] = useState(load);
  const [draft, setDraft] = useState<Draft>(initial.draft);
  const [settings, setSettings] = useState<Settings>(initial.settings);
  const [screen, setScreen] = useState<"setup" | "draft">("setup");
  const [continuing, setContinuing] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<Role | "all">("all");
  const [hideUsed, setHideUsed] = useState(false);
  const [sort, setSort] = useState("official");
  const [running, setRunning] = useState(false);
  const [remaining, setRemaining] = useState(settings.seconds);
  const [modal, setModal] = useState<"info" | "reset" | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [cacheReady, setCacheReady] = useState(false);
  const [notice, setNotice] = useState("");
  const [swapFrom, setSwapFrom] = useState<{
    team: Team;
    index: number;
  } | null>(null);
  const [draftSettings, setDraftSettings] = useState({
    ...settings,
    first: "purple" as Team,
    allStar: draft.allStar,
  });
  const [deferredInstall, setDeferredInstall] = useState<Event | null>(null);
  const step = currentStep(draft);
  const stageIndex = step?.index ?? 12;
  const complete = !step;
  const phase = step?.phase || "pick";
  const activeTeam = step?.team || draft.first;
  const selectedPokemon = selected ? byId.get(selected) : undefined;
  const schedule = steps(draft.first);
  const bans = draft.actions.filter((a) => a.phase === "ban");
  const picks = draft.actions.filter((a) => a.phase === "pick");
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE, JSON.stringify({ draft, settings }));
    } catch {
      setNotice("自動保存が利用できません。この画面では引き続き操作できます。");
    }
  }, [draft, settings]);
  useEffect(() => {
    setRemaining(settings.seconds);
  }, [stageIndex, draft.game, settings.seconds]);
  useEffect(() => {
    if (
      !running ||
      complete ||
      modal ||
      screen === "setup" ||
      settings.seconds === 0
    )
      return;
    const id = window.setInterval(
      () => setRemaining((t) => Math.max(0, t - 1)),
      1000,
    );
    return () => clearInterval(id);
  }, [running, complete, modal, screen, settings.seconds]);
  useEffect(() => {
    if (remaining === 0 && running && settings.seconds > 0) {
      setRunning(false);
      setNotice("制限時間になりました。ポケモンを選んで確定してください。");
    }
  }, [remaining, running, settings.seconds]);
  useEffect(() => {
    if (complete) setRunning(false);
  }, [complete]);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(""), 5500);
    return () => clearTimeout(id);
  }, [notice]);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    const install = (e: Event) => {
      e.preventDefault();
      setDeferredInstall(e);
    };
    const sw = (e: MessageEvent) => {
      if (e.data?.type === "OFFLINE_READY") setCacheReady(true);
    };
    addEventListener("online", update);
    addEventListener("offline", update);
    addEventListener("beforeinstallprompt", install);
    navigator.serviceWorker?.addEventListener("message", sw);
    if ("serviceWorker" in navigator && import.meta.env.PROD)
      navigator.serviceWorker.ready
        .then((r) => r.active?.postMessage({ type: "CHECK_OFFLINE" }))
        .catch(() => {});
    return () => {
      removeEventListener("online", update);
      removeEventListener("offline", update);
      removeEventListener("beforeinstallprompt", install);
      navigator.serviceWorker?.removeEventListener("message", sw);
    };
  }, []);
  const visible = useMemo(
    () =>
      pokemon
        .filter(
          (p) =>
            (role === "all" || p.role === role) &&
            (!hideUsed || !unavailable(draft, p.id)) &&
            (!query || normalize(p.name + p.id).includes(normalize(query))),
        )
        .sort((a, b) =>
          sort === "name"
            ? a.name.localeCompare(b.name, "ja")
            : sort === "new"
              ? b.order - a.order
              : a.order - b.order,
        ),
    [role, hideUsed, draft, query, sort],
  );
  const confirm = () => {
    if (!selected) return;
    const result = choose(draft, selected, ids);
    if (result === draft) return;
    setDraft(result);
    setSelected(null);
    if (settings.sound) {
      try {
        const context = new AudioContext();
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.frequency.value = phase === "ban" ? 330 : 660;
        gain.gain.setValueAtTime(0.035, context.currentTime);
        gain.gain.exponentialRampToValueAtTime(
          0.001,
          context.currentTime + 0.12,
        );
        oscillator.start();
        oscillator.stop(context.currentTime + 0.13);
        oscillator.onended = () => {
          void context.close();
        };
      } catch {
        /* sound is optional */
      }
    }
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        e.key === "Enter" &&
        selected &&
        !modal &&
        screen === "draft" &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLButtonElement) &&
        !(e.target instanceof HTMLSelectElement)
      ) {
        e.preventDefault();
        confirm();
      }
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  });
  const teamName = (team: Team) => settings[team];
  const openSetup = () => {
    setRunning(false);
    setContinuing(false);
    setSelected(null);
    setDraftSettings({ ...settings, first: "purple", allStar: draft.allStar });
    setScreen("setup");
  };
  const startDraft = () => {
    const next = {
      purple: draftSettings.purple.trim() || defaults.purple,
      orange: draftSettings.orange.trim() || defaults.orange,
      seconds: draftSettings.seconds,
      sound: settings.sound,
    };
    setSettings(next);
    setDraft(
      continuing
        ? { ...draft, first: draftSettings.first }
        : createDraft(draftSettings.first, draftSettings.allStar),
    );
    setSelected(null);
    setSwapFrom(null);
    setQuery("");
    setRole("all");
    setHideUsed(false);
    setNotice("");
    setRemaining(next.seconds);
    setRunning(next.seconds > 0);
    setScreen("draft");
  };
  const resumeDraft = () => {
    setRemaining(settings.seconds);
    setRunning(false);
    setScreen("draft");
  };
  const exportResult = () => {
    const lines = [
      `UNITE DRAFT / GAME ${draft.game}`,
      `2026-09-18 公式掲載ロスター`,
      ...(["purple", "orange"] as Team[]).flatMap((team) => [
        `\n${teamName(team)}${draft.first === team ? "（先攻）" : "（後攻）"}`,
        `BAN: ${bans
          .filter((a) => a.team === team)
          .map((a) => (a.pokemon ? byId.get(a.pokemon)?.name : "スキップ"))
          .join(" / ")}`,
        `PICK: ${picks
          .filter((a) => a.team === team)
          .map((a) => byId.get(a.pokemon!)?.name)
          .join(" / ")}`,
      ]),
    ];
    const url = URL.createObjectURL(
      new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `unite-draft-game-${draft.game}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };
  function renderTeamPanel(team: Team) {
    const ownBans = bans.filter((a) => a.team === team);
    const ownPicks = picks.filter((a) => a.team === team);
    return (
      <aside
        className={`team-panel ${team} ${step?.team === team ? "team-active" : ""}`}
        aria-label={teamName(team)}
      >
        <div className="team-heading">
          <span className="team-emblem">
            <Shield size={21} />
          </span>
          <div>
            <span className="eyebrow">
              {team === "purple" ? "PURPLE" : "ORANGE"} TEAM
            </span>
            <h2>{teamName(team)}</h2>
          </div>
          <span className="order-label">
            {draft.first === team ? "先攻" : "後攻"}
          </span>
        </div>
        <div className="bans-heading">
          <span>
            <Ban size={13} />
            使用禁止
          </span>
          <span>{ownBans.length} / 3</span>
        </div>
        <div className="ban-slots">
          {[0, 1, 2].map((i) => {
            const action = ownBans[i];
            const p = action?.pokemon ? byId.get(action.pokemon) : undefined;
            const active =
              step?.phase === "ban" &&
              step.team === team &&
              ownBans.length === i;
            return (
              <div
                key={i}
                className={`ban-slot ${active ? "active" : ""} ${action ? "filled" : ""}`}
                aria-label={`BAN ${i + 1}: ${p?.name || (action ? "スキップ" : "未選択")}`}
              >
                {p ? (
                  <>
                    <Portrait p={p} eager />
                    <Ban className="ban-mark" size={20} />
                  </>
                ) : action ? (
                  <span className="skip-mark">—</span>
                ) : (
                  <Ban size={23} />
                )}
                <span className="ban-slot-label">
                  {p?.name || (active ? "選択中" : `BAN ${i + 1}`)}
                </span>
              </div>
            );
          })}
        </div>
        <div className="picks-heading">
          <span>選出ポケモン</span>
          <span>{ownPicks.length} / 5</span>
        </div>
        <div className="player-list">
          {[0, 1, 2, 3, 4].map((i) => {
            const p = ownPicks[i]?.pokemon
              ? byId.get(ownPicks[i].pokemon!)
              : undefined;
            const active =
              step?.phase === "pick" &&
              step.team === team &&
              i >= ownPicks.length &&
              i < ownPicks.length + step.remaining;
            const preview =
              active && i === ownPicks.length ? selectedPokemon : undefined;
            const shown = p || preview;
            const swapping = swapFrom?.team === team && swapFrom.index === i;
            return (
              <button
                key={i}
                className={`player-slot ${active ? "active" : ""} ${p ? "filled" : ""} ${swapping ? "swapping" : ""}`}
                disabled={!complete}
                aria-label={`${teamName(team)} ${i + 1}番: ${p?.name || "未選択"}${complete ? " 交換する" : ""}`}
                onClick={() => {
                  if (!swapFrom) {
                    setSwapFrom({ team, index: i });
                    return;
                  }
                  if (swapFrom.team === team) {
                    setDraft(swap(draft, team, swapFrom.index, i));
                    setSwapFrom(null);
                  } else setSwapFrom({ team, index: i });
                }}
              >
                <span className="player-number">0{i + 1}</span>
                <div
                  className={`player-portrait ${shown ? "has-pokemon" : ""}`}
                >
                  {shown ? (
                    <Portrait p={shown} eager />
                  ) : (
                    <span className="pokeball-symbol" />
                  )}
                </div>
                <div className="player-info">
                  <span className="player-name">
                    {p ? p.name : active ? "ポケモンを選択中" : "選択待ち"}
                  </span>
                  <span className="trainer">
                    <UserRound size={12} />
                    Trainer {team === "purple" ? i + 1 : i + 6}
                  </span>
                  {p && (
                    <span className={`role-text ${p.role}`}>
                      {roles[p.role]}型
                    </span>
                  )}
                </div>
                {active ? (
                  <span className="selecting-bars">
                    <i />
                    <i />
                    <i />
                  </span>
                ) : p ? (
                  <Check className="player-check" size={16} />
                ) : (
                  <span className="slot-dash">—</span>
                )}
              </button>
            );
          })}
        </div>
        <div className="team-composition">
          {(Object.keys(roles) as Role[]).map((r) => (
            <span key={r} title={`${roles[r]}型`} className={r}>
              <i />
              {ownPicks.filter((a) => byId.get(a.pokemon!)?.role === r).length}
            </span>
          ))}
        </div>
      </aside>
    );
  }
  return (
    <div
      className={`app ${activeTeam} ${complete ? "draft-complete" : ""} ${screen === "setup" ? "setup-mode" : ""}`}
    >
      <header className="app-header">
        <a className="brand" href="/" aria-label="UNITE DRAFT">
          <img src="/icon.svg" width="34" height="34" alt="" />
          <span>
            UNITE<span className="brand-light"> DRAFT</span>
            <small>ドラフトシミュレーター</small>
          </span>
        </a>
        <div className="header-center">
          <Trophy size={15} />
          <span>
            {draft.allStar ? "オールスタードラフト" : "大会・カスタム練習"}
          </span>
          <span className="header-divider" />
          <span>3 BAN / 5 PICK</span>
        </div>
        <div className="header-actions">
          <span className="snapshot">2026.09.18</span>
          <button
            className="icon-button"
            title="画面を広げる"
            aria-label="全画面表示"
            onClick={() => {
              if (document.fullscreenElement)
                document.exitFullscreen().catch(() => {});
              else if (document.documentElement.requestFullscreen)
                document.documentElement
                  .requestFullscreen()
                  .catch(() =>
                    setNotice("このブラウザーでは全画面表示を利用できません。"),
                  );
              else setNotice("このブラウザーでは全画面表示を利用できません。");
            }}
          >
            <Expand size={18} />
          </button>
          <button
            className="icon-button"
            title="使い方・ルール"
            aria-label="使い方・ルール"
            onClick={() => setModal("info")}
          >
            <CircleHelp size={19} />
          </button>
          {screen === "draft" && (
            <button
              className="setup-return-button"
              aria-label="準備画面に戻る"
              onClick={openSetup}
            >
              <House size={16} />
              <span>準備画面</span>
            </button>
          )}
        </div>
      </header>
      {screen === "setup" ? (
        <SetupScreen
          values={draftSettings}
          onChange={setDraftSettings}
          onStart={startDraft}
          onResume={resumeDraft}
          hasSaved={draft.actions.length > 0 || draft.game > 1}
          progress={draft.actions.length}
          game={draft.game}
          continuing={continuing}
        />
      ) : (
        <main className="draft-main">
          <section className="phase-banner" aria-label="ドラフトの進行状況">
            <div className="phase-label">
              <span className="eyebrow">
                {complete
                  ? "DRAFT COMPLETE"
                  : phase === "ban"
                    ? "BAN PHASE"
                    : "PICK PHASE"}
              </span>
              <h1>
                {complete
                  ? "ドラフト完了"
                  : phase === "ban"
                    ? "使用禁止フェーズ"
                    : "選択フェーズ"}
              </h1>
            </div>
            <div className="phase-message" aria-live="polite">
              <span className={`team-tag ${activeTeam}`}>
                {complete ? (
                  <CheckCheck size={16} />
                ) : phase === "ban" ? (
                  <Ban size={16} />
                ) : (
                  <Swords size={16} />
                )}
              </span>
              <div>
                <strong>
                  {complete
                    ? "両チームの選出が完了しました"
                    : `${teamName(activeTeam)}が${phase === "ban" ? "使用禁止にする" : "使用する"}ポケモンを選択`}
                </strong>
                <span>
                  {complete
                    ? "味方の枠を2つ選ぶと、ポケモンを交換できます。"
                    : phase === "ban"
                      ? `BAN ${bans.length + 1} / 6 · 各チーム3体を交互に指定`
                      : `PICK ${picks.length + 1} / 10 · このターンはあと${step?.remaining}体`}
                </span>
              </div>
            </div>
            <div
              className={`timer ${remaining <= 5 && settings.seconds > 0 ? "urgent" : ""}`}
            >
              <span className="eyebrow">練習タイマー</span>
              <div>
                <Clock3 size={18} />
                <strong>
                  {settings.seconds === 0
                    ? "∞"
                    : String(remaining).padStart(2, "0")}
                </strong>
                <button
                  className="timer-button"
                  aria-label={running ? "タイマーを停止" : "タイマーを開始"}
                  disabled={complete || settings.seconds === 0}
                  onClick={() => {
                    if (remaining === 0) setRemaining(settings.seconds);
                    setRunning(!running);
                  }}
                >
                  {running ? <Pause size={16} /> : <Play size={16} />}
                </button>
              </div>
            </div>
          </section>
          <section className="draft-arena" aria-label="ドラフト画面">
            {renderTeamPanel("purple")}
            <section className="selection-panel" aria-label="ポケモン一覧">
              <div className="selection-top">
                <div>
                  <Grid2X2 size={17} />
                  <h2>ポケモンを選択</h2>
                  <span className="roster-count">{pokemon.length}</span>
                </div>
                <label className="sort-select">
                  <select
                    aria-label="ポケモンの並び順"
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                  >
                    <option value="official">公式掲載順</option>
                    <option value="name">名前順</option>
                    <option value="new">新しい順</option>
                  </select>
                  <ChevronDown size={13} />
                </label>
              </div>
              <div className="roster-tools">
                <label className="search-field">
                  <Search size={17} />
                  <input
                    type="search"
                    placeholder="ポケモンを検索"
                    aria-label="ポケモンを検索"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  {query && (
                    <button
                      aria-label="検索をクリア"
                      onClick={() => setQuery("")}
                    >
                      <X size={14} />
                    </button>
                  )}
                </label>
                <label className="hide-used">
                  <input
                    type="checkbox"
                    checked={hideUsed}
                    onChange={(e) => setHideUsed(e.target.checked)}
                  />
                  <span>選択可能のみ</span>
                </label>
              </div>
              <div className="role-tabs" aria-label="バトルスタイル">
                <button
                  className={role === "all" ? "selected" : ""}
                  onClick={() => setRole("all")}
                  aria-pressed={role === "all"}
                >
                  すべて
                </button>
                {(Object.keys(roles) as Role[]).map((r) => (
                  <button
                    key={r}
                    className={`${r} ${role === r ? "selected" : ""}`}
                    onClick={() => setRole(r)}
                    aria-pressed={role === r}
                  >
                    <i />
                    {roles[r]}
                  </button>
                ))}
              </div>
              <div className="pokemon-grid" key={`${role}-${sort}`}>
                {visible.map((p, i) => {
                  const used = unavailable(draft, p.id);
                  const action = draft.actions.find((a) => a.pokemon === p.id);
                  const old = draft.excluded.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      className={`pokemon-card ${p.role} ${selected === p.id ? "is-selected" : ""} ${used ? "unavailable" : ""}`}
                      disabled={used || complete}
                      aria-label={`${p.name} ${roles[p.role]}型${used ? " 選択不可" : ""}`}
                      aria-pressed={selected === p.id}
                      onClick={() => setSelected(p.id)}
                    >
                      <span className="card-role-stripe" />
                      <Portrait p={p} eager={i < 24} />
                      <span className="pokemon-name">{p.name}</span>
                      {selected === p.id && (
                        <span className="selected-check">
                          <Check size={14} />
                        </span>
                      )}
                      {used && (
                        <span className="used-overlay">
                          {action?.phase === "pick" ? (
                            <Check size={23} />
                          ) : (
                            <Ban size={25} />
                          )}
                          <span>
                            {old
                              ? "前の試合"
                              : action?.phase === "pick"
                                ? "PICK"
                                : "BAN"}
                          </span>
                        </span>
                      )}
                    </button>
                  );
                })}
                {visible.length === 0 && (
                  <div className="empty-results">
                    <Search size={30} />
                    <strong>該当するポケモンがいません</strong>
                    <button
                      onClick={() => {
                        setQuery("");
                        setRole("all");
                        setHideUsed(false);
                      }}
                    >
                      絞り込みを解除
                    </button>
                  </div>
                )}
              </div>
              <div className="selection-footer">
                <span>{visible.length}体を表示</span>
                <span>
                  <i className="legend-dot" />
                  選択中 <Ban size={12} />
                  使用不可
                </span>
              </div>
            </section>
            {renderTeamPanel("orange")}
          </section>
          <section className="decision-bar">
            <div className="utility-actions">
              <button
                className="subtle-button"
                disabled={!draft.actions.length}
                onClick={() => {
                  setDraft(undo(draft));
                  setSelected(null);
                  setSwapFrom(null);
                  setRunning(false);
                }}
              >
                <Undo2 size={17} />
                <span>1つ戻す</span>
              </button>
              <button
                className="subtle-button"
                onClick={() => setModal("reset")}
              >
                <RotateCcw size={16} />
                <span>リセット</span>
              </button>
            </div>
            <div className="decision-main">
              {complete ? (
                <>
                  <button
                    className="confirm-button complete-button"
                    onClick={exportResult}
                  >
                    <Download size={18} />
                    結果を保存
                  </button>
                  <button
                    className="next-game"
                    onClick={() => {
                      const next = nextGame(draft);
                      setDraft(next);
                      setSelected(null);
                      setSwapFrom(null);
                      setRunning(false);
                      setContinuing(true);
                      setDraftSettings({
                        ...settings,
                        first: "purple",
                        allStar: next.allStar,
                      });
                      setScreen("setup");
                    }}
                  >
                    次の試合
                    <ArrowRight size={16} />
                  </button>
                </>
              ) : (
                <>
                  <div className="selected-description">
                    {selectedPokemon ? (
                      <>
                        <strong>{selectedPokemon.name}</strong>
                        <span>
                          {phase === "ban"
                            ? "を使用禁止にします"
                            : "を選出します"}
                        </span>
                      </>
                    ) : (
                      <span>
                        {phase === "ban"
                          ? "使用禁止にするポケモンを選んでください"
                          : "使用するポケモンを選んでください"}
                      </span>
                    )}
                  </div>
                  <button
                    className="confirm-button"
                    disabled={!selected}
                    onClick={confirm}
                  >
                    {phase === "ban" ? <Ban size={18} /> : <Check size={21} />}
                    <span>{phase === "ban" ? "使用禁止にする" : "決定"}</span>
                    <span className="enter-hint">↵</span>
                  </button>
                </>
              )}
            </div>
            <div className="decision-extra">
              {step?.phase === "ban" ? (
                <button
                  className="subtle-button"
                  onClick={() => {
                    setDraft(choose(draft, null, ids));
                    setSelected(null);
                  }}
                >
                  <SkipForward size={16} />
                  BANをスキップ
                </button>
              ) : (
                <span className="game-counter">
                  <Flag size={15} /> GAME {String(draft.game).padStart(2, "0")}
                </span>
              )}
            </div>
          </section>
          <section className="timeline" aria-label="BAN・PICKの順番">
            <div className="timeline-label">
              <span className="eyebrow">DRAFT ORDER</span>
              <span>進行順</span>
            </div>
            <div className="timeline-stages">
              {schedule.map((s, i) => (
                <div
                  key={i}
                  className={`timeline-step ${s.team} ${i === stageIndex ? "current" : ""} ${i < stageIndex ? "done" : ""}`}
                  title={`${teamName(s.team)} ${s.phase.toUpperCase()} ${s.count}体`}
                  aria-current={i === stageIndex ? "step" : undefined}
                >
                  {i === 6 && <span className="timeline-separator" />}
                  <span className="step-node">
                    {i < stageIndex ? (
                      <Check size={13} />
                    ) : s.phase === "ban" ? (
                      <Ban size={12} />
                    ) : (
                      s.count
                    )}
                  </span>
                  <span>
                    {s.phase.toUpperCase()}
                    {s.phase === "pick" && s.count === 2 ? " ×2" : ""}
                  </span>
                </div>
              ))}
            </div>
            <span className="progress-count">
              {draft.actions.length}
              <small>/ 16</small>
            </span>
          </section>
        </main>
      )}
      <footer className="app-footer">
        <span>
          非公式ファンメイドツール<span className="footer-divider">·</span>©
          Pokémon / Nintendo / Creatures / GAME FREAK / TiMi
        </span>
        <div>
          <button className="footer-link" onClick={() => setModal("info")}>
            <Info size={13} />
            ルール・データについて
          </button>
          <span className="connection">
            <Wifi size={13} />
            {!online
              ? "オフライン"
              : cacheReady
                ? "オフライン利用可能"
                : "自動保存"}
          </span>
          <button
            className="sound-button"
            aria-label={settings.sound ? "操作音をオフ" : "操作音をオン"}
            onClick={() => setSettings({ ...settings, sound: !settings.sound })}
          >
            {settings.sound ? <Volume2 size={15} /> : <VolumeX size={15} />}
          </button>
        </div>
      </footer>
      {notice && (
        <div className="toast" role="status">
          <Info size={17} />
          {notice}
          <button aria-label="通知を閉じる" onClick={() => setNotice("")}>
            <X size={15} />
          </button>
        </div>
      )}
      {modal === "reset" && (
        <Modal title="ドラフトをリセット" onClose={() => setModal(null)}>
          <p>
            現在のBAN・PICKと、オールスタードラフトの過去の選出を消去し、GAME
            01からやり直します。
          </p>
          <div className="modal-buttons">
            <button className="modal-secondary" onClick={() => setModal(null)}>
              キャンセル
            </button>
            <button
              className="modal-primary"
              onClick={() => {
                setDraft(createDraft(draft.first, draft.allStar));
                setSelected(null);
                setSwapFrom(null);
                setRunning(false);
                setRemaining(settings.seconds);
                setModal(null);
              }}
            >
              リセットする
            </button>
          </div>
        </Modal>
      )}
      {modal === "info" && (
        <Modal title="使い方・ルールについて" onClose={() => setModal(null)}>
          <div className="info-content">
            <p>
              1台の端末で両チームを操作する、大会形式のドラフト練習ツールです。ポケモンを選び、中央のボタンで確定してください。
            </p>
            <h3>大会モード · 各チーム3 BAN</h3>
            <p>
              BAN：先攻 → 後攻を3回繰り返します。
              <br />
              PICK：先攻1 → 後攻2 → 先攻2 → 後攻2 → 先攻2 →
              後攻1。2体選ぶターンはタイマーを共有します。
            </p>
            <p>
              ランクマッチや通常カスタムの投票式BANは対象外です。ミュウツーX・Yとメガシンカの別ライセンスはそれぞれ選択できます。
            </p>
            <h3>公式掲載データ · 2026年9月18日確認</h3>
            <p>
              公式サイト掲載の{pokemon.length}
              枠を収録。未掲載の参戦予告ポケモン、大会ごとの使用制限は含みません。画像は公式素材をWebP化し、このアプリ内から読み込みます。
            </p>
            <h3>保存・オフライン</h3>
            <p>
              進行状況はこのブラウザーに自動保存されます。「オフライン利用可能」の表示後は、再読み込みもオフラインで利用できます。iPhoneはSafariの共有メニューから「ホーム画面に追加」を選べます。
            </p>
            {deferredInstall && (
              <button
                className="modal-secondary"
                onClick={async () => {
                  const e = deferredInstall as Event & {
                    prompt: () => Promise<void>;
                  };
                  await e.prompt();
                  setDeferredInstall(null);
                }}
              >
                アプリをインストール
              </button>
            )}
            <h3>参照資料</h3>
            <a
              href="https://www.pokemonunite.jp/ja/pokemon/"
              target="_blank"
              rel="noreferrer"
            >
              ポケモンユナイト公式：ポケモン一覧 ↗
            </a>
            <a
              href="https://help.playvs.com/en/articles/10684293-pokemon-unite-rulebook"
              target="_blank"
              rel="noreferrer"
            >
              PlayVS：大会ドラフトの進行順 ↗
            </a>
            <a
              href="https://www.pokemonunite.jp/ja/topics/battle/20260415-1/"
              target="_blank"
              rel="noreferrer"
            >
              公式：オールスタードラフト・画面資料 ↗
            </a>
            <p className="form-note">
              Pokémon
              UNITE公式アプリではありません。画面構成を参考にした練習用再現で、対戦への接続やゲームの操作は行いません。
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}
export default App;
