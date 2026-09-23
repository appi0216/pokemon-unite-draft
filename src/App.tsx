import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import Portrait from "./components/Portrait";
import SetupScreen from "./components/SetupScreen";
import { createResultImage } from "./result-image";
import TeamHistory from "./components/TeamHistory";
import {
  ArrowLeftRight,
  ArrowRight,
  Ban,
  Check,
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
  redundantAllStarBan,
  rewindToStep,
  restoreDraft,
  steps,
  swap,
  unavailable,
  undo,
} from "./domain/draft";
import type { Draft, Team } from "./domain/draft";
import { turnSeconds } from "./domain/timer";

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
  seconds: 0,
  sound: false,
};
function load() {
  try {
    const v = JSON.parse(localStorage.getItem(STORAGE) || "null");
    const draft = restoreDraft(v?.draft, ids);
    const s = v?.settings;
    return {
      draft: draft || createDraft(),
      started:
        !!draft &&
        (v?.started === true || draft.actions.length > 0 || draft.game > 1),
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
    return { draft: createDraft(), settings: defaults, started: false };
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
  const [started, setStarted] = useState(initial.started);
  const [screen, setScreen] = useState<"setup" | "draft">(
    initial.started ? "draft" : "setup",
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<Role | "all">("all");
  const [hideUsed, setHideUsed] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [sort, setSort] = useState("name");
  const [sortOpen, setSortOpen] = useState(false);
  const sortMenu = useRef<HTMLDivElement>(null);
  const [compactView, setCompactView] = useState<
    "purple" | "roster" | "orange"
  >("roster");
  const [rewindTarget, setRewindTarget] = useState<number | null>(null);
  const pokemonGrid = useRef<HTMLDivElement>(null);
  const [running, setRunning] = useState(false);
  const [remaining, setRemaining] = useState(() =>
    turnSeconds(settings.seconds > 0, currentStep(draft)?.phase || "ban"),
  );
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
    bestOf: draft.bestOf,
  });
  const [deferredInstall, setDeferredInstall] = useState<Event | null>(null);
  const step = currentStep(draft);
  const stageIndex = step?.index ?? 12;
  const complete = !step;
  const phase = step?.phase || "pick";
  const duration = turnSeconds(settings.seconds > 0, phase);
  const activeTeam = step?.team || draft.first;
  const selectedPokemon = selected ? byId.get(selected) : undefined;
  const schedule = steps(draft.first);
  const stageStarts = schedule.map((_, index) =>
    schedule.slice(0, index).reduce((total, stage) => total + stage.count, 0),
  );
  const bans = draft.actions.filter((a) => a.phase === "ban");
  const picks = draft.actions.filter((a) => a.phase === "pick");
  useEffect(() => {
    if (!sortOpen) return;
    const close = (event: PointerEvent) => {
      if (!sortMenu.current?.contains(event.target as Node)) setSortOpen(false);
    };
    addEventListener("pointerdown", close);
    return () => removeEventListener("pointerdown", close);
  }, [sortOpen]);
  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE,
        JSON.stringify({ draft, settings, started }),
      );
    } catch {
      setNotice("自動保存が利用できません。この画面では引き続き操作できます。");
    }
  }, [draft, settings, started]);
  useEffect(() => {
    setRemaining(duration);
  }, [stageIndex, draft.game, duration]);
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
            (!hideUsed ||
              (!unavailable(draft, p.id, activeTeam) &&
                !redundantAllStarBan(draft, p.id, activeTeam))) &&
            (!query || normalize(p.name + p.id).includes(normalize(query))),
        )
        .sort((a, b) =>
          sort === "name"
            ? a.name.localeCompare(b.name, "ja")
            : b.order - a.order,
        ),
    [role, hideUsed, draft, query, sort],
  );
  const confirm = () => {
    if (
      !selected ||
      (hideUsed && redundantAllStarBan(draft, selected, activeTeam))
    )
      return;
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
      const editing =
        e.target instanceof HTMLElement &&
        (e.target.isContentEditable ||
          !!e.target.closest("input, textarea, select"));
      if (
        screen === "draft" &&
        !modal &&
        rewindTarget === null &&
        !resultImage &&
        !editing &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !e.repeat
      ) {
        if (e.key === "/") {
          e.preventDefault();
          document
            .querySelector<HTMLInputElement>('input[type="search"]')
            ?.focus();
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setSortOpen(false);
          setSelected(null);
          (document.activeElement as HTMLElement)?.blur();
          return;
        }
        if (e.key.toLowerCase() === "p" && settings.seconds > 0 && !complete) {
          e.preventDefault();
          if (!remaining) setRemaining(duration);
          setRunning(!running);
          return;
        }
        if (e.key.toLowerCase() === "u" && draft.actions.length) {
          e.preventDefault();
          setDraft(undo(draft));
          setSelected(null);
          setSwapFrom(null);
          setRunning(false);
          return;
        }
      }
      if (
        e.key === "Enter" &&
        selected &&
        !modal &&
        rewindTarget === null &&
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
    setSelected(null);
    setDraftSettings({
      ...settings,
      first: "purple",
      allStar: draft.allStar,
      bestOf: draft.bestOf,
    });
    setScreen("setup");
    window.scrollTo({ top: 0, behavior: "instant" });
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
      createDraft(
        draftSettings.first,
        draftSettings.allStar,
        draftSettings.bestOf,
      ),
    );
    setStarted(true);
    setSelected(null);
    setSwapFrom(null);
    setQuery("");
    setRole("all");
    setHideUsed(true);
    setNotice("");
    setRemaining(turnSeconds(next.seconds > 0, "ban"));
    setRunning(next.seconds > 0);
    setScreen("draft");
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const resumeDraft = () => {
    setRemaining(duration);
    setRunning(false);
    setScreen("draft");
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const exportResult = async () => {
    setExporting(true);
    try {
      setResultImage(await createResultImage(draft, settings));
    } catch {
      setNotice("画像を作成できませんでした。もう一度お試しください。");
    } finally {
      setExporting(false);
    }
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
            const preview = active ? selectedPokemon : undefined;
            const shown = p ?? preview;
            return (
              <div
                key={i}
                className={`ban-slot ${active ? "active" : ""} ${action ? "filled" : ""} ${preview && !p ? "preview" : ""}`}
                aria-label={`BAN ${i + 1}: ${shown?.name || (action ? "スキップ" : "未選択")}`}
              >
                {shown ? (
                  <>
                    <div className="ban-image">
                      <Portrait p={shown} eager />
                    </div>
                    {p && <Ban className="ban-mark" size={20} />}
                  </>
                ) : action ? (
                  <span className="skip-mark">—</span>
                ) : (
                  <Ban size={23} />
                )}
                <span className="ban-slot-label">
                  {shown?.name || (active ? "選択中" : `BAN ${i + 1}`)}
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
                    <span className="empty-pick-mark" aria-hidden="true">
                      <UserRound size={22} strokeWidth={1.25} />
                    </span>
                  )}
                </div>
                <div className="player-info">
                  <span className="player-name">
                    {shown
                      ? shown.name
                      : active
                        ? "ポケモンを選択中"
                        : "選択待ち"}
                  </span>
                  <span className="trainer">
                    <UserRound size={12} />
                    Trainer {team === "purple" ? i + 1 : i + 6}
                  </span>
                  {shown && (
                    <span className={`role-text ${shown.role}`}>
                      {roles[shown.role]}型
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
        <a
          className="brand"
          href={import.meta.env.BASE_URL}
          aria-label="UNITE DRAFT ホーム"
          onClick={(e) => {
            e.preventDefault();
            openSetup();
          }}
        >
          <img
            src={`${import.meta.env.BASE_URL}icon.svg`}
            width="34"
            height="34"
            alt=""
          />
          <span>
            UNITE<span className="brand-light"> DRAFT</span>
            <small>
              {screen === "draft"
                ? `${draft.allStar ? `オールスター · BO${draft.bestOf}` : "通常ドラフト"} · GAME ${String(draft.game).padStart(2, "0")}`
                : "ドラフトシミュレーター"}
            </small>
          </span>
        </a>
        <div className="header-center">
          {screen === "draft" ? (
            <div className="header-phase" aria-live="polite">
              <div className="header-phase-title">
                <span>
                  {complete
                    ? "DRAFT COMPLETE"
                    : phase === "ban"
                      ? "BAN PHASE"
                      : "PICK PHASE"}
                </span>
                <strong>
                  {complete
                    ? "ドラフト完了"
                    : phase === "ban"
                      ? "使用禁止フェーズ"
                      : "選択フェーズ"}
                </strong>
              </div>
              <span className="header-phase-divider" />
              <strong className="header-instruction">
                {complete
                  ? "両チームの選出が完了しました。味方の枠を2つ選ぶと、ポケモンを交換できます。"
                  : `${teamName(activeTeam)}が${phase === "ban" ? "使用禁止にする" : "使用する"}ポケモンを選択`}
              </strong>
              {settings.seconds > 0 && (
                <div
                  className={`header-timer ${remaining <= 5 ? "urgent" : ""}`}
                  aria-label="ターンの残り時間"
                >
                  <Clock3 size={14} />
                  <strong>{String(remaining).padStart(2, "0")}</strong>
                  <button
                    className="timer-button"
                    aria-label={running ? "タイマーを停止" : "タイマーを開始"}
                    disabled={complete}
                    onClick={() => {
                      if (remaining === 0) setRemaining(duration);
                      setRunning(!running);
                    }}
                  >
                    {running ? <Pause size={13} /> : <Play size={13} />}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              <Trophy size={15} />
              <span>大会・カスタム練習</span>
              <span className="header-divider" />
              <span>3 BAN / 5 PICK</span>
            </>
          )}
        </div>
        <div className="header-actions">
          {screen === "setup" && <span className="snapshot">2026.09.18</span>}
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
              aria-label="ホームに戻る"
              onClick={openSetup}
            >
              <House size={16} />
              <span>ホーム</span>
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
          hasSaved={started}
          progress={draft.actions.length}
          game={draft.game}
          savedAllStar={draft.allStar}
        />
      ) : (
        <main className="draft-main">
          <section
            className="phase-banner timeline-only"
            aria-label="ドラフトの進行状況"
          >
            <section className="timeline" aria-label="BAN・PICKの順番">
              <div className="timeline-label">
                <span className="eyebrow">DRAFT ORDER</span>
                <span>進行順</span>
              </div>
              <div className="timeline-stages">
                {schedule.map((s, i) => (
                  <button
                    key={i}
                    type="button"
                    className={`timeline-step ${s.team} ${i === stageIndex ? "current" : ""} ${i < stageIndex ? "done" : ""}`}
                    disabled={stageStarts[i] >= draft.actions.length}
                    title={
                      stageStarts[i] < draft.actions.length
                        ? `${teamName(s.team)}の${s.phase === "ban" ? "BAN" : "PICK"}ターンに戻る（以降の選出を取り消します）`
                        : `${teamName(s.team)} ${s.phase.toUpperCase()} ${s.count}体`
                    }
                    aria-label={`第${i + 1}区間 ${teamName(s.team)}の${s.phase === "ban" ? "BAN" : "PICK"} ${s.count}体のターン${stageStarts[i] < draft.actions.length ? "に戻る" : ""}`}
                    aria-current={i === stageIndex ? "step" : undefined}
                    onClick={() => setRewindTarget(i)}
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
                  </button>
                ))}
              </div>
            </section>
          </section>
          {draft.allStar &&
            draft.excluded.some(
              (id) =>
                !draft.history.some((g) =>
                  g.picks.some((p) => p.pokemon === id),
                ),
            ) && (
              <details className="legacy-history">
                <summary>
                  以前の保存データの使用済みポケモン（チーム情報なし）
                </summary>
                <div>
                  {draft.excluded
                    .filter(
                      (id) =>
                        !draft.history.some((g) =>
                          g.picks.some((p) => p.pokemon === id),
                        ),
                    )
                    .map((id) => (
                      <span key={id}>{byId.get(id)?.name}</span>
                    ))}
                </div>
              </details>
            )}
          <nav className="compact-view-tabs" aria-label="ドラフト画面の表示">
            {(["purple", "roster", "orange"] as const).map((view) => (
              <button
                key={view}
                type="button"
                className={`${view} ${compactView === view ? "selected" : ""}`}
                aria-current={compactView === view ? "page" : undefined}
                onClick={() => setCompactView(view)}
              >
                {view === "roster" ? "ポケモン一覧" : teamName(view)}
                {view !== "roster" && !complete && step?.team === view && (
                  <span className="compact-turn-label">ターン</span>
                )}
              </button>
            ))}
          </nav>
          <section
            className={`draft-arena ${draft.allStar ? "allstar-arena" : ""} compact-view-${compactView}`}
            aria-label="ドラフト画面"
          >
            <div className="team-side purple">
              {draft.allStar && (
                <TeamHistory
                  team="purple"
                  name={teamName("purple")}
                  history={draft.history}
                  active={!complete && step?.team === "purple"}
                />
              )}
              {renderTeamPanel("purple")}
            </div>
            <section className="selection-panel" aria-label="ポケモン一覧">
              <div className="selection-top">
                <div>
                  <Grid2X2 size={17} />
                  <h2>ポケモンを選択</h2>
                  <span className="roster-count">{pokemon.length}</span>
                </div>
                <div
                  className={`sort-select ${sortOpen ? "open" : ""}`}
                  ref={sortMenu}
                  onKeyDown={(event) => {
                    if (
                      !sortOpen ||
                      !["ArrowDown", "ArrowUp"].includes(event.key)
                    )
                      return;
                    event.preventDefault();
                    const options = Array.from(
                      event.currentTarget.querySelectorAll<HTMLButtonElement>(
                        ".sort-menu button",
                      ),
                    );
                    const current = options.indexOf(
                      document.activeElement as HTMLButtonElement,
                    );
                    const delta = event.key === "ArrowDown" ? 1 : -1;
                    const next =
                      current < 0
                        ? event.key === "ArrowDown"
                          ? 0
                          : options.length - 1
                        : (current + delta + options.length) % options.length;
                    options[next]?.focus();
                  }}
                >
                  <button
                    type="button"
                    className="sort-trigger"
                    aria-label="ポケモンの並び順"
                    aria-haspopup="listbox"
                    aria-expanded={sortOpen}
                    onClick={() => setSortOpen(!sortOpen)}
                  >
                    <span>{sort === "name" ? "名前順" : "新しい順"}</span>
                    <ChevronDown size={13} />
                  </button>
                  {sortOpen && (
                    <div
                      className="sort-menu"
                      role="listbox"
                      aria-label="並び順"
                    >
                      {[
                        ["name", "名前順"],
                        ["new", "新しい順"],
                      ].map(([value, label]) => (
                        <button
                          type="button"
                          role="option"
                          aria-selected={sort === value}
                          className={sort === value ? "selected" : ""}
                          key={value}
                          onClick={() => {
                            setSort(value);
                            setSortOpen(false);
                          }}
                        >
                          <span>{label}</span>
                          {sort === value && <Check size={13} />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
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
                    onChange={(e) => {
                      setHideUsed(e.target.checked);
                      if (
                        e.target.checked &&
                        selected &&
                        redundantAllStarBan(draft, selected, activeTeam)
                      )
                        setSelected(null);
                    }}
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
              <div
                className="pokemon-grid"
                ref={pokemonGrid}
                key={`${role}-${sort}`}
                aria-label="ポケモン選択。矢印キーで移動、Enterで確定"
                onKeyDown={(e) => {
                  const current = (
                    e.target as HTMLElement
                  ).closest<HTMLButtonElement>(".pokemon-card");
                  if (!current || current.disabled) return;
                  const cards = Array.from(
                    e.currentTarget.querySelectorAll<HTMLButtonElement>(
                      ".pokemon-card:not(:disabled)",
                    ),
                  );
                  const index = cards.indexOf(current);
                  if (e.key === "Enter") {
                    e.preventDefault();
                    e.stopPropagation();
                    if (e.repeat) return;
                    confirm();
                    requestAnimationFrame(() => {
                      const next = Array.from(
                        pokemonGrid.current?.querySelectorAll<HTMLButtonElement>(
                          ".pokemon-card:not(:disabled)",
                        ) || [],
                      );
                      next[Math.min(index, next.length - 1)]?.focus();
                    });
                    return;
                  }
                  if (
                    ![
                      "ArrowLeft",
                      "ArrowRight",
                      "ArrowUp",
                      "ArrowDown",
                      "Home",
                      "End",
                    ].includes(e.key)
                  )
                    return;
                  e.preventDefault();
                  let target: HTMLButtonElement | undefined;
                  if (e.key === "Home") target = cards[0];
                  else if (e.key === "End") target = cards[cards.length - 1];
                  else if (e.key === "ArrowLeft") target = cards[index - 1];
                  else if (e.key === "ArrowRight") target = cards[index + 1];
                  else {
                    const from = current.getBoundingClientRect();
                    const direction = e.key === "ArrowDown" ? 1 : -1;
                    target = cards
                      .filter(
                        (card) =>
                          (card.getBoundingClientRect().top - from.top) *
                            direction >
                          1,
                      )
                      .sort((a, b) => {
                        const ar = a.getBoundingClientRect(),
                          br = b.getBoundingClientRect();
                        return (
                          Math.abs(ar.top - from.top) -
                            Math.abs(br.top - from.top) ||
                          Math.abs(ar.left - from.left) -
                            Math.abs(br.left - from.left)
                        );
                      })[0];
                  }
                  target?.focus();
                }}
              >
                {visible.map((p, i) => {
                  const used = unavailable(draft, p.id, activeTeam);
                  const action = draft.actions.find((a) => a.pokemon === p.id);
                  const old = draft.history.length
                    ? draft.history.some((game) =>
                        game.picks.some(
                          (pick) =>
                            pick.team === activeTeam && pick.pokemon === p.id,
                        ),
                      )
                    : draft.excluded.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      className={`pokemon-card ${p.role} ${selected === p.id ? "is-selected" : ""} ${used ? "unavailable" : ""}`}
                      disabled={used || complete}
                      tabIndex={
                        p.id ===
                        (selected &&
                        visible.some(
                          (v) =>
                            v.id === selected &&
                            !unavailable(draft, v.id, activeTeam),
                        )
                          ? selected
                          : visible.find(
                              (v) => !unavailable(draft, v.id, activeTeam),
                            )?.id)
                          ? 0
                          : -1
                      }
                      aria-label={`${p.name} ${roles[p.role]}型${used ? " 選択不可" : ""}`}
                      aria-pressed={selected === p.id}
                      onClick={() => setSelected(p.id)}
                      onFocus={() => setSelected(p.id)}
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
                <span className="keyboard-hint">矢印で選択 · Enterで確定</span>
                <span>
                  <i className="legend-dot" />
                  選択中 <Ban size={12} />
                  使用不可
                </span>
              </div>
            </section>
            <div className="team-side orange">
              {renderTeamPanel("orange")}
              {draft.allStar && (
                <TeamHistory
                  team="orange"
                  name={teamName("orange")}
                  history={draft.history}
                  active={!complete && step?.team === "orange"}
                />
              )}
            </div>
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
                    className={
                      draft.allStar && draft.game >= draft.bestOf
                        ? "next-game final-image-action"
                        : "confirm-button complete-button"
                    }
                    onClick={exportResult}
                    disabled={exporting}
                  >
                    <Download size={18} />
                    {exporting ? "画像を作成中…" : "結果を画像で保存"}
                  </button>
                  <button
                    className={
                      draft.allStar && draft.game >= draft.bestOf
                        ? "confirm-button"
                        : "next-game"
                    }
                    onClick={() => {
                      if (draft.allStar && draft.game >= draft.bestOf) {
                        openSetup();
                        return;
                      }
                      const next = nextGame(draft);
                      setDraft(next);
                      setSelected(null);
                      setSwapFrom(null);
                      setQuery("");
                      setRole("all");
                      setHideUsed(true);
                      setNotice("");
                      setRemaining(turnSeconds(settings.seconds > 0, "ban"));
                      setRunning(settings.seconds > 0);
                      window.scrollTo({ top: 0, behavior: "instant" });
                    }}
                  >
                    {draft.allStar && draft.game >= draft.bestOf
                      ? "準備画面へ戻る"
                      : "次の試合"}
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
              ) : draft.allStar ? (
                <span className="game-counter">
                  <Flag size={15} /> GAME {String(draft.game).padStart(2, "0")}{" "}
                  / BO{draft.bestOf}
                </span>
              ) : null}
            </div>
          </section>
        </main>
      )}
      <footer className="app-footer">
        <span>
          非公式ファンメイドツール<span className="footer-divider">·</span>©
          Pokémon / Nintendo / Creatures / GAME FREAK / TiMi
          <span className="footer-divider">·</span>2026.09.18
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
      {resultImage && (
        <Modal title="ドラフト結果の画像" onClose={() => setResultImage(null)}>
          <img
            className="result-image-preview"
            src={resultImage}
            alt="両チームのBANとPICKの結果"
          />
          <a
            className="image-download"
            href={resultImage}
            download={
              draft.allStar
                ? `unite-draft-bo${draft.bestOf}-game-${draft.game}.png`
                : "unite-draft.png"
            }
          >
            <Download size={18} />
            PNG画像を保存
          </a>
          <p className="field-hint">画像を長押しして保存することもできます。</p>
        </Modal>
      )}
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
            {draft.allStar
              ? "現在のBAN・PICKと過去の選出を消去し、オールスタードラフトを最初からやり直します。"
              : "現在のBAN・PICKを消去し、ドラフトを最初からやり直します。"}
          </p>
          <div className="modal-buttons">
            <button className="modal-secondary" onClick={() => setModal(null)}>
              キャンセル
            </button>
            <button
              className="modal-primary"
              onClick={() => {
                setDraft(createDraft(draft.first, draft.allStar, draft.bestOf));
                setSelected(null);
                setSwapFrom(null);
                setRunning(false);
                setRemaining(turnSeconds(settings.seconds > 0, "ban"));
                setModal(null);
              }}
            >
              リセットする
            </button>
          </div>
        </Modal>
      )}
      {rewindTarget !== null && (
        <Modal
          title={`この${schedule[rewindTarget].phase === "ban" ? "BAN" : "PICK"}フェーズに戻りますか？`}
          onClose={() => setRewindTarget(null)}
        >
          <div className="modal-buttons">
            <button
              className="modal-secondary"
              onClick={() => setRewindTarget(null)}
            >
              キャンセル
            </button>
            <button
              className="modal-primary"
              onClick={() => {
                const target = rewindTarget;
                setDraft(rewindToStep(draft, target));
                setSelected(null);
                setSwapFrom(null);
                setRunning(false);
                setRemaining(
                  turnSeconds(settings.seconds > 0, schedule[target].phase),
                );
                setRewindTarget(null);
              }}
            >
              戻る
            </button>
          </div>
        </Modal>
      )}
      {modal === "info" && (
        <Modal title="使い方・ルールについて" onClose={() => setModal(null)}>
          <div className="info-content">
            <h3>キーボード操作</h3>
            <p>
              矢印：ポケモンを選択 ／ Enter：確定 ／ /：検索 ／ Esc：選択解除 ／
              P：タイマー停止・再開 ／
              U：1つ戻す。文字入力中はショートカットを無効にします。
            </p>
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
