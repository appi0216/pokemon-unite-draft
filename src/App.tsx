import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import Portrait from "./components/Portrait";
import DraftTools from "./components/DraftTools";
import {
  parseBackup,
  downloadBlob,
  PRESETS_KEY,
  readPresets,
} from "./domain/backup";
import SetupScreen from "./components/SetupScreen";
import { createSeriesImage, createResultImage } from "./result-image";
import TeamHistory from "./components/TeamHistory";
import useRosterPages from "./components/useRosterPages";
import { AppInstallPanel } from "./pwa/AppInstallPanel";
import { usePwaStatus } from "./pwa/runtime";
import {
  ArrowLeftRight,
  ArrowDownWideNarrow,
  Ban,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
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
  SlidersHorizontal,
  House,
  History as HistoryIcon,
  Shield,
  SkipForward,
  Trophy,
  Undo2,
  Redo2,
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
  draftFromPastGame,
  nextGame,
  redundantAllStarBan,
  rewindToStep,
  reviewableGames,
  restoreDraft,
  steps,
  swap,
  unavailable,
  undo,
} from "./domain/draft";
import type { Draft, PastGame, Team } from "./domain/draft";
import { turnSeconds } from "./domain/timer";

const STORAGE = "unite-draft.v1";
type Settings = {
  purple: string;
  orange: string;
  seconds: number;
  sound: boolean;
  trainers: string[];
};
const defaultTrainers = Array.from(
  { length: 10 },
  (_, i) => `トレーナー ${i + 1}`,
);
const defaults: Settings = {
  purple: "パープルチーム",
  orange: "オレンジチーム",
  seconds: 0,
  sound: false,
  trainers: defaultTrainers,
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
          ? {
              ...s,
              trainers:
                Array.isArray(s.trainers) &&
                s.trainers.length === 10 &&
                s.trainers.every((name: unknown) => typeof name === "string")
                  ? s.trainers
                  : defaultTrainers,
            }
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
  className = "",
  notice = "",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  notice?: string;
}) {
  const headingId = useId();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={headingId}
      className={className}
      onCancel={onClose}
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        if (
          e.target === e.currentTarget &&
          (e.clientX < rect.left ||
            e.clientX > rect.right ||
            e.clientY < rect.top ||
            e.clientY > rect.bottom)
        )
          onClose();
      }}
    >
      <div className="modal-heading">
        <h2 id={headingId}>{title}</h2>
        <button className="icon-button" onClick={onClose} aria-label="閉じる">
          <X />
        </button>
      </div>
      {notice && (
        <p className="dialog-notice" role="status">
          {notice}
        </p>
      )}
      {children}
    </dialog>
  );
}
function App() {
  const [initial] = useState(load);
  const [draft, updateDraft] = useState<Draft>(initial.draft);
  const [redoStack, setRedoStack] = useState<Draft[]>([]);
  const setDraft = (value: Draft | ((d: Draft) => Draft)) => {
    setRedoStack([]);
    updateDraft(value);
  };
  const undoDraft = () => {
    if (!draft.actions.length) return;
    setRedoStack((stack) => [...stack, draft]);
    updateDraft(undo(draft));
    setSelected(null);
    setSwapFrom(null);
    setRunning(false);
  };
  const redoDraft = () => {
    const previous = redoStack.at(-1);
    if (!previous) return;
    updateDraft(previous);
    setRedoStack((stack) => stack.slice(0, -1));
    setSelected(null);
    setSwapFrom(null);
    setRunning(false);
  };
  const [toolsOpen, setToolsOpen] = useState(false);
  const [restrictions, setRestrictions] = useState<string[]>(
    initial.draft.restricted ?? [],
  );
  const [pendingBackup, setPendingBackup] = useState<ReturnType<
    typeof parseBackup
  > | null>(null);
  const [seriesBusy, setSeriesBusy] = useState(false);
  const [settings, setSettings] = useState<Settings>(initial.settings);
  const [started, setStarted] = useState(initial.started);
  const [screen, setScreen] = useState<"setup" | "draft">(
    initial.started ? "draft" : "setup",
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<Role | "all">("all");
  const [hideUsed, setHideUsed] = useState(true);
  const [sort, setSort] = useState("name");
  const [sortOpen, setSortOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const sortMenu = useRef<HTMLDivElement>(null);
  const [compactView, setCompactView] = useState<
    "purple" | "roster" | "orange"
  >("roster");
  const [rewindTarget, setRewindTarget] = useState<number | null>(null);
  const [firstPrompt, setFirstPrompt] = useState<
    "start" | "next" | "reset" | null
  >(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewGame, setReviewGame] = useState<PastGame | null>(null);
  const [exportingHistory, setExportingHistory] = useState<number | null>(null);
  const rosterLayout = useRosterPages(
    screen === "draft" && !reviewGame,
    compactView,
  );
  const pokemonGrid = rosterLayout.ref;
  const [rosterPage, setRosterPage] = useState(0);
  const pageFocus = useRef<"first" | "last" | null>(null);
  const completionAction = useRef<HTMLButtonElement>(null);
  const firstTeamOption = useRef<HTMLButtonElement>(null);
  const keyboardNavigation = useRef(false);
  const [running, setRunning] = useState(false);
  const [remaining, setRemaining] = useState(() =>
    turnSeconds(settings.seconds > 0, currentStep(draft)?.phase || "ban"),
  );
  const [modal, setModal] = useState<"info" | "reset" | "replace" | null>(null);
  const [storageOk, setStorageOk] = useState(true);
  const { online, offline } = usePwaStatus();
  const cacheReady = offline === "ready";
  const [notice, setNotice] = useState("");
  const [swapFrom, setSwapFrom] = useState<{
    team: Team;
    index: number;
  } | null>(null);
  const [draftSettings, setDraftSettings] = useState({
    ...settings,
    allStar: draft.allStar,
    fearless: draft.seriesRule === "fearless",
    bestOf: draft.bestOf,
  });
  const step = currentStep(draft);
  const stageIndex = step?.index ?? 12;
  const complete = !step;
  const showingPastGame = reviewGame !== null;
  const visuallyComplete = complete || showingPastGame;
  const phase = step?.phase || "pick";
  const duration = turnSeconds(settings.seconds > 0, phase);
  const activeTeam = step?.team || draft.first;
  const seriesLabel = draft.seriesRule === "all-star" ? "ALL-STAR" : "FEARLESS";
  const selectedPokemon = selected ? byId.get(selected) : undefined;
  const schedule = steps(draft.first);
  const stageStarts = schedule.map((_, index) =>
    schedule.slice(0, index).reduce((total, stage) => total + stage.count, 0),
  );
  const bans = draft.actions.filter((a) => a.phase === "ban");
  const picks = draft.actions.filter((a) => a.phase === "pick");
  const reviewGames = useMemo(() => reviewableGames(draft), [draft]);
  useEffect(() => {
    if (!draft.names)
      updateDraft((current) => ({
        ...current,
        names: {
          purple: settings.purple,
          orange: settings.orange,
          trainers: [...settings.trainers],
        },
      }));
  }, [draft.names, settings]);
  const promptAllStar =
    firstPrompt === "start" ? draftSettings.allStar : draft.allStar;
  const promptGame =
    firstPrompt === "next"
      ? draft.game + 1
      : firstPrompt === "start"
        ? 1
        : draft.game;
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
      setStorageOk(true);
    } catch {
      setStorageOk(false);
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
      firstPrompt ||
      reviewOpen ||
      toolsOpen ||
      pendingBackup ||
      screen === "setup" ||
      settings.seconds === 0
    )
      return;
    const id = window.setInterval(
      () => setRemaining((t) => Math.max(0, t - 1)),
      1000,
    );
    return () => clearInterval(id);
  }, [
    running,
    complete,
    modal,
    firstPrompt,
    reviewOpen,
    toolsOpen,
    pendingBackup,
    screen,
    settings.seconds,
  ]);
  useEffect(() => {
    if (remaining === 0 && running && settings.seconds > 0) {
      setRunning(false);
      if (phase === "ban") {
        setDraft((current) => choose(current, null, ids));
        setSelected(null);
        setNotice("制限時間になったため、使用禁止投票をスキップしました。");
      } else {
        setNotice("制限時間になりました。ポケモンを選んで確定してください。");
      }
    }
  }, [remaining, running, settings.seconds, phase]);
  useEffect(() => {
    if (complete) setRunning(false);
  }, [complete]);
  useEffect(() => {
    if (!complete || !keyboardNavigation.current || screen !== "draft") return;
    requestAnimationFrame(() => completionAction.current?.focus());
  }, [complete, screen]);
  useEffect(() => {
    if (!firstPrompt) return;
    requestAnimationFrame(() => firstTeamOption.current?.focus());
    const moveFirstPromptFocus = (event: KeyboardEvent) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      const purple = firstTeamOption.current;
      const dialog = purple?.closest("dialog");
      const orange = dialog?.querySelector<HTMLButtonElement>(
        ".first-prompt-options .orange",
      );
      const close = dialog?.querySelector<HTMLButtonElement>(
        ".modal-heading .icon-button",
      );
      if (!purple || !orange || !close) return;
      event.preventDefault();
      const controls = [purple, orange, close];
      const current = controls.indexOf(
        document.activeElement as HTMLButtonElement,
      );
      const direction = event.key === "ArrowRight" ? 1 : -1;
      controls[
        (Math.max(current, 0) + direction + controls.length) % controls.length
      ].focus();
    };
    addEventListener("keydown", moveFirstPromptFocus);
    return () => removeEventListener("keydown", moveFirstPromptFocus);
  }, [firstPrompt]);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(""), 5500);
    return () => clearTimeout(id);
  }, [notice]);
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
  const pageCount = Math.max(1, Math.ceil(visible.length / rosterLayout.size));
  const currentPage = Math.min(rosterPage, pageCount - 1);
  const pageStart = currentPage * rosterLayout.size;
  const pagePokemon = visible.slice(pageStart, pageStart + rosterLayout.size);
  useEffect(() => {
    setRosterPage(0);
    setSelected(null);
  }, [query, role, sort, hideUsed]);
  useEffect(() => {
    if (!selected) return;
    const index = visible.findIndex((p) => p.id === selected);
    if (index >= 0) setRosterPage(Math.floor(index / rosterLayout.size));
  }, [rosterLayout.size]);
  useEffect(() => {
    if (!pageFocus.current) return;
    const cards = pokemonGrid.current?.querySelectorAll<HTMLButtonElement>(
      ".pokemon-card:not(:disabled)",
    );
    const target =
      pageFocus.current === "last" ? cards?.[cards.length - 1] : cards?.[0];
    pageFocus.current = null;
    target?.focus();
  }, [currentPage, rosterLayout.size]);
  const goToRosterPage = (page: number, focus?: "first" | "last") => {
    if (page < 0 || page >= pageCount || page === currentPage) return;
    pageFocus.current = focus ?? null;
    setSelected(null);
    setRosterPage(page);
    if (pokemonGrid.current) pokemonGrid.current.scrollTop = 0;
  };
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
      const interactive =
        e.target instanceof Element &&
        !!e.target.closest(
          "button, a[href], summary, input, textarea, select, [role='button'], [role='tab'], [contenteditable]",
        );
      if (
        screen === "draft" &&
        !modal &&
        !filtersOpen &&
        !firstPrompt &&
        !reviewOpen &&
        !toolsOpen &&
        !pendingBackup &&
        rewindTarget === null &&
        !editing &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !e.repeat
      ) {
        if (
          !complete &&
          ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key) &&
          !(e.target instanceof Element && e.target.closest(".pokemon-grid"))
        ) {
          const first = pokemonGrid.current?.querySelector<HTMLButtonElement>(
            ".pokemon-card:not(:disabled)",
          );
          if (first) {
            e.preventDefault();
            keyboardNavigation.current = true;
            first.focus();
          }
          return;
        }
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
        if (e.key.toLowerCase() === "y" && redoStack.length) {
          e.preventDefault();
          redoDraft();
          return;
        }
        if (e.key.toLowerCase() === "u" && draft.actions.length) {
          e.preventDefault();
          undoDraft();
          setSelected(null);
          setSwapFrom(null);
          setRunning(false);
          return;
        }
      }
      if (
        e.key === "Enter" &&
        !firstPrompt &&
        !reviewOpen &&
        !toolsOpen &&
        !pendingBackup &&
        selected &&
        !modal &&
        !filtersOpen &&
        rewindTarget === null &&
        screen === "draft" &&
        !editing &&
        !interactive &&
        !e.defaultPrevented &&
        !e.repeat
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
    setReviewGame(null);
    setSelected(null);
    setDraftSettings({
      ...settings,
      allStar: draft.allStar,
      fearless: draft.seriesRule === "fearless",
      bestOf: draft.bestOf,
    });
    setScreen("setup");
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const startDraft = (first: Team) => {
    const next = {
      purple: draftSettings.purple.trim() || defaults.purple,
      orange: draftSettings.orange.trim() || defaults.orange,
      seconds: draftSettings.seconds,
      sound: settings.sound,
      trainers: draftSettings.trainers.map(
        (name, index) => name.trim() || defaultTrainers[index],
      ),
    };
    setSettings(next);
    setDraft({
      ...createDraft(
        first,
        draftSettings.allStar,
        draftSettings.bestOf,
        draftSettings.fearless ? "fearless" : "all-star",
      ),
      names: {
        purple: next.purple,
        orange: next.orange,
        trainers: [...next.trainers],
      },
      restricted: [...restrictions],
    });
    setStarted(true);
    setReviewGame(null);
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
    setReviewGame(null);
    setScreen("draft");
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const downloadPastResult = async (past: PastGame) => {
    setExportingHistory(past.game);
    try {
      const archived = draftFromPastGame(
        past,
        draft.bestOf,
        draft.allStar,
        draft.seriesRule,
      );
      const image = await createResultImage(archived, past.names ?? settings);
      const blob = await fetch(image).then((response) => response.blob());
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = draft.allStar
        ? `unite-draft-bo${draft.bestOf}-game-${past.game}.png`
        : `unite-draft-history-${past.game}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setNotice("履歴の画像を作成できませんでした。もう一度お試しください。");
    } finally {
      setExportingHistory(null);
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
            <h2>{teamName(team)}</h2>
          </div>
          <span className="order-label">
            {draft.first === team ? "先攻" : "後攻"}
          </span>
        </div>
        <div className="bans-heading">
          <span>
            <Ban size={14} /> 使用禁止
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
                aria-label={`使用禁止 ${i + 1}: ${shown?.name || (action ? "スキップ" : "未選択")}`}
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
                {!shown && !action && (
                  <span className="ban-slot-label">
                    {active ? "選択中" : `使用禁止 ${i + 1}`}
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <div className="picks-heading">
          <span>
            <Check size={14} /> 選択
          </span>
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
                aria-label={`${teamName(team)} ${i + 1}番: ${shown?.name || "未選択"}${preview ? " 選択中" : complete ? " 交換する" : ""}`}
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
                    {shown ? shown.name : active ? "選択中" : "—"}
                  </span>
                  {shown && (
                    <span className={`role-text ${shown.role}`}>
                      {roles[shown.role]}
                    </span>
                  )}
                  {settings.trainers[team === "purple" ? i : i + 5] !==
                    defaultTrainers[team === "purple" ? i : i + 5] && (
                    <span className="trainer">
                      <UserRound size={12} />
                      {settings.trainers[team === "purple" ? i : i + 5]}
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
      </aside>
    );
  }
  return (
    <div
      className={`app ${activeTeam} ${visuallyComplete ? "draft-complete" : ""} ${screen === "setup" ? "setup-mode" : ""}`}
      onPointerDown={() => {
        keyboardNavigation.current = false;
      }}
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
            src={`${import.meta.env.BASE_URL}icon.png`}
            width="34"
            height="34"
            alt=""
          />
          {screen === "setup" && (
            <span>
              UNITE<span className="brand-light"> DRAFT</span>
              <small>ドラフトシミュレーター</small>
            </span>
          )}
        </a>
        <div className="header-center">
          {screen === "draft" ? (
            <div
              className={`header-phase ${visuallyComplete ? "is-complete" : ""}`}
              aria-live="polite"
            >
              <div className="header-phase-title">
                <strong>
                  {visuallyComplete
                    ? "完了"
                    : phase === "ban"
                      ? "使用禁止"
                      : "選択"}
                </strong>
              </div>
              <span className="header-phase-divider" />
              <strong className="header-instruction">
                {showingPastGame
                  ? draft.allStar
                    ? `第${reviewGame.game}試合`
                    : "ドラフト結果"
                  : complete
                    ? "同じチームの2枠で交換"
                    : teamName(activeTeam)}
              </strong>
              {settings.seconds > 0 && !visuallyComplete && (
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
              <span>使用禁止 3匹 / 選択 5匹</span>
            </>
          )}
        </div>
        <div className="header-actions">
          {screen === "draft" && reviewGames.length > 0 && (
            <button
              className={`icon-button review-history-button${complete ? " history-result-ready" : ""}`}
              title="試合履歴・画像保存"
              aria-label="試合履歴・画像保存"
              onClick={() => setReviewOpen(true)}
            >
              <HistoryIcon size={18} />
            </button>
          )}
          <button
            className="icon-button fullscreen-button"
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
            {storageOk ? (
              <CircleHelp size={19} />
            ) : (
              <span
                role="alert"
                style={{
                  fontSize: "0.6875rem",
                  color: "#ffd28a",
                  whiteSpace: "nowrap",
                }}
              >
                未保存
              </span>
            )}
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
          onStart={() =>
            started ? setModal("replace") : setFirstPrompt("start")
          }
          onResume={resumeDraft}
          onTools={() => setToolsOpen(true)}
          hasSaved={started}
          progress={draft.actions.length}
          game={draft.game}
          savedMode={
            draft.allStar
              ? draft.seriesRule === "all-star"
                ? "all-star"
                : "fearless"
              : "standard"
          }
        />
      ) : showingPastGame ? (
        <main className="draft-main past-draft-screen">
          <section className="past-draft-heading">
            <span>
              {draft.allStar
                ? `${seriesLabel} · BO${draft.bestOf}`
                : "STANDARD"}
            </span>
            <strong>
              {draft.allStar ? `第${reviewGame.game}試合` : "ドラフト結果"}
            </strong>
            <span>終了時点</span>
          </section>
          <section
            className="past-draft-teams"
            aria-label={`第${reviewGame.game}試合の終了結果`}
          >
            {(["purple", "orange"] as Team[]).map((team) => {
              const first = reviewGame.first ?? reviewGame.bans?.[0]?.team;
              const teamBans =
                reviewGame.bans?.filter((ban) => ban.team === team) ?? [];
              const teamPicks = reviewGame.picks.filter(
                (pick) => pick.team === team,
              );
              return (
                <section className={`past-draft-team ${team}`} key={team}>
                  <header>
                    <span className="team-emblem">
                      <Shield size={21} />
                    </span>
                    <h2>{teamName(team)}</h2>
                    <span className="order-label">
                      {first ? (first === team ? "先攻" : "後攻") : "順番不明"}
                    </span>
                  </header>
                  <h3>使用禁止</h3>
                  <div className="past-draft-bans">
                    {Array.from({ length: 3 }, (_, index) => {
                      const ban = teamBans[index];
                      const p = ban?.pokemon ? byId.get(ban.pokemon) : null;
                      return (
                        <div key={index}>
                          {p ? <Portrait p={p} /> : <span>—</span>}
                        </div>
                      );
                    })}
                  </div>
                  <h3>選択したポケモン</h3>
                  <div className="past-draft-picks">
                    {teamPicks.map((pick, index) => {
                      const p = byId.get(pick.pokemon)!;
                      return (
                        <article key={p.id}>
                          <span>{String(index + 1).padStart(2, "0")}</span>
                          <Portrait p={p} />
                          <div>
                            <strong>{p.name}</strong>
                            <small>{roles[p.role]}</small>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </section>
          <div className="past-draft-return">
            <button
              className="subtle-button"
              onClick={() => setReviewOpen(true)}
            >
              <HistoryIcon size={16} />
              試合履歴に戻る
            </button>
            <button
              className="confirm-button"
              onClick={() => setReviewGame(null)}
            >
              閉じる
            </button>
          </div>
        </main>
      ) : (
        <main className="draft-main">
          <details className="progress-disclosure">
            <summary
              aria-label={`ドラフトの進行状況 ${draft.actions.length} / 16`}
            >
              <span>
                {draft.allStar
                  ? `${seriesLabel} · ${draft.game} / ${draft.bestOf}`
                  : "ドラフト"}
              </span>
              <span className="progress-dots" aria-hidden="true">
                {schedule.map((s, i) => (
                  <i
                    key={i}
                    className={`${s.team} ${i < stageIndex ? "done" : ""} ${i === stageIndex ? "current" : ""}`}
                  />
                ))}
              </span>
              <span>{draft.actions.length} / 16</span>
              <ChevronDown size={16} />
            </summary>
            <section
              className="phase-banner timeline-only"
              aria-label="ドラフトの進行状況"
            >
              <section className="timeline" aria-label="使用禁止・選択の順番">
                <span className="timeline-meta">
                  {draft.allStar
                    ? `${seriesLabel} · BO${draft.bestOf}`
                    : "STANDARD"}
                  {draft.allStar && <b>第{draft.game}試合</b>}
                </span>
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
                          ? `${teamName(s.team)}の${s.phase === "ban" ? "使用禁止" : "選択"}ターンに戻る（以降の選出を取り消します）`
                          : `${teamName(s.team)} ${s.phase === "ban" ? "使用禁止" : "選択"} ${s.count}匹`
                      }
                      aria-label={`第${i + 1}区間 ${teamName(s.team)}の${s.phase === "ban" ? "使用禁止" : "選択"} ${s.count}匹のターン${stageStarts[i] < draft.actions.length ? "に戻る" : ""}`}
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
                        {s.phase === "ban" ? "使用禁止" : "選択"}
                        {s.phase === "pick" && s.count === 2 ? " ×2" : ""}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            </section>
          </details>
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
                {view === "roster" ? (
                  <>
                    <Grid2X2 size={20} />
                    <span>一覧</span>
                  </>
                ) : (
                  <>
                    <span className="compact-team-name">
                      {teamName(view)}
                      {!complete && step?.team === view && (
                        <span className="compact-turn-label">●</span>
                      )}
                    </span>
                    <span className="compact-picks" aria-hidden="true">
                      {[0, 1, 2, 3, 4].map((i) => {
                        const id = picks.filter((p) => p.team === view)[i]
                          ?.pokemon;
                        return (
                          <span key={i}>
                            {id ? (
                              <Portrait p={byId.get(id)!} eager />
                            ) : (
                              <UserRound size={12} />
                            )}
                          </span>
                        );
                      })}
                    </span>
                    <span className="compact-ban-count">
                      使用禁止 {bans.filter((b) => b.team === view).length}/3
                    </span>
                  </>
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
                  <h2>ポケモン</h2>
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
                    <ArrowDownWideNarrow size={18} />
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
                <button
                  className={`filter-toggle ${filtersOpen ? "selected" : ""}`}
                  aria-label="絞り込み"
                  aria-expanded={filtersOpen}
                  aria-haspopup="dialog"
                  aria-controls="roster-filters"
                  onClick={() => setFiltersOpen(!filtersOpen)}
                >
                  <SlidersHorizontal size={20} />
                  {(role !== "all" || !hideUsed) && (
                    <span className="filter-active-dot" />
                  )}
                </button>
              </div>
              {filtersOpen && (
                <Modal
                  title="絞り込み"
                  className="filter-dialog"
                  onClose={() => setFiltersOpen(false)}
                >
                  <div id="roster-filters" className="roster-filters">
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
                  </div>
                  <button
                    className="modal-primary"
                    onClick={() => setFiltersOpen(false)}
                  >
                    {visible.length}匹を表示
                  </button>
                </Modal>
              )}
              <div
                className="pokemon-grid"
                id="pokemon-collection"
                ref={pokemonGrid}
                style={{
                  gridTemplateColumns: `repeat(${rosterLayout.columns}, minmax(0, 1fr))`,
                  gridTemplateRows: visible.length
                    ? `repeat(${rosterLayout.rows}, minmax(0, 1fr))`
                    : "minmax(0, 1fr)",
                }}
                aria-label="ポケモン選択。矢印キーで移動、Enterで確定、Page Up・Page Downでページ移動"
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
                  if (e.key === "PageDown" || e.key === "PageUp") {
                    e.preventDefault();
                    goToRosterPage(
                      currentPage + (e.key === "PageDown" ? 1 : -1),
                      e.key === "PageDown" ? "first" : "last",
                    );
                    return;
                  }
                  if (e.key === "Enter") {
                    e.preventDefault();
                    e.stopPropagation();
                    if (e.repeat) return;
                    keyboardNavigation.current = true;
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
                  if (target) target.focus();
                  else if (e.key === "ArrowRight" || e.key === "ArrowDown")
                    goToRosterPage(currentPage + 1, "first");
                  else if (e.key === "ArrowLeft" || e.key === "ArrowUp")
                    goToRosterPage(currentPage - 1, "last");
                }}
              >
                {pagePokemon.map((p, i) => {
                  const used = unavailable(draft, p.id, activeTeam);
                  const action = draft.actions.find((a) => a.pokemon === p.id);
                  const old = draft.history.length
                    ? draft.history.some((game) =>
                        game.picks.some(
                          (pick) =>
                            (draft.seriesRule === "all-star" ||
                              pick.team === activeTeam) &&
                            pick.pokemon === p.id,
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
                        pagePokemon.some(
                          (v) =>
                            v.id === selected &&
                            !unavailable(draft, v.id, activeTeam),
                        )
                          ? selected
                          : pagePokemon.find(
                              (v) => !unavailable(draft, v.id, activeTeam),
                            )?.id)
                          ? 0
                          : -1
                      }
                      aria-label={`${p.name} ${roles[p.role]}${used ? " 選択不可" : ""}`}
                      aria-pressed={selected === p.id}
                      onClick={() => setSelected(p.id)}
                      onFocus={() => setSelected(p.id)}
                    >
                      <span className="card-role-stripe" />
                      <Portrait p={p} eager={i < 24} />
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
                            {draft.restricted?.includes(p.id)
                              ? "大会制限"
                              : old
                                ? "過去の選出"
                                : action?.phase === "pick"
                                  ? "選択"
                                  : "使用禁止"}
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
                <span className="roster-range">
                  {visible.length
                    ? `${pageStart + 1}–${Math.min(pageStart + rosterLayout.size, visible.length)} / ${visible.length}匹`
                    : "0匹"}
                </span>
                <nav
                  className="roster-pagination"
                  aria-label="ポケモン一覧のページ"
                >
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="前のページ"
                    aria-controls="pokemon-collection"
                    disabled={currentPage === 0}
                    onClick={() => goToRosterPage(currentPage - 1)}
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <span
                    role="status"
                    aria-live="polite"
                    aria-atomic="true"
                    aria-label={`${currentPage + 1} / ${pageCount}ページ`}
                  >
                    {currentPage + 1} / {pageCount}
                  </span>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="次のページ"
                    aria-controls="pokemon-collection"
                    disabled={currentPage === pageCount - 1}
                    onClick={() => goToRosterPage(currentPage + 1)}
                  >
                    <ChevronRight size={20} />
                  </button>
                </nav>
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
                aria-label="1つ戻す"
                title="1つ戻す"
                disabled={!draft.actions.length}
                onClick={() => {
                  undoDraft();
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
                aria-label="1つ進む"
                title="1つ進む"
                disabled={!redoStack.length}
                onClick={redoDraft}
              >
                <Redo2 size={16} />
                <span>1つ進む</span>
              </button>
              <button
                className="subtle-button"
                aria-label="リセット"
                title="リセット"
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
                    ref={completionAction}
                    className="confirm-button completion-next"
                    onClick={() => {
                      if (draft.allStar && draft.game >= draft.bestOf) {
                        openSetup();
                        return;
                      }
                      setFirstPrompt("next");
                    }}
                  >
                    {draft.allStar && draft.game >= draft.bestOf
                      ? "ホーム"
                      : "次の試合"}
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="confirm-button"
                    disabled={!selected}
                    onClick={confirm}
                    aria-label={`${selectedPokemon?.name ?? "ポケモン"}の${phase === "ban" ? "使用禁止" : "選択"}を決定`}
                  >
                    {phase === "ban" ? <Ban size={18} /> : <Check size={18} />}
                    <span>決定</span>
                  </button>
                </>
              )}
            </div>
            <div className="decision-extra">
              {step?.phase === "ban" ? (
                <button
                  className="subtle-button"
                  aria-label="使用禁止投票をスキップ"
                  onClick={() => {
                    setDraft(choose(draft, null, ids));
                    setSelected(null);
                  }}
                >
                  <SkipForward size={16} />
                  <span>スキップ</span>
                </button>
              ) : draft.allStar ? (
                <span className="game-counter">
                  <Flag size={15} /> 第{draft.game}試合 / BO{draft.bestOf}
                </span>
              ) : null}
            </div>
          </section>
        </main>
      )}
      <footer className="app-footer">
        <span>非公式ツール · © Pokémon</span>
        <div>
          <button className="footer-link" onClick={() => setModal("info")}>
            <Info size={13} />
            このアプリについて
          </button>
          <span className="connection">
            <Wifi size={13} />
            {!storageOk
              ? "未保存"
              : !online
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
      {notice && !toolsOpen && !pendingBackup && !reviewOpen && (
        <div className="toast" role="status">
          <Info size={17} />
          {notice}
          <button aria-label="通知を閉じる" onClick={() => setNotice("")}>
            <X size={15} />
          </button>
        </div>
      )}
      {toolsOpen && (
        <Modal
          title="チーム・大会設定とバックアップ"
          className="tools-dialog"
          notice={notice}
          onClose={() => setToolsOpen(false)}
        >
          <DraftTools
            values={draftSettings}
            onChange={setDraftSettings}
            restricted={restrictions}
            onRestricted={setRestrictions}
            report={setNotice}
            onExport={() =>
              downloadBlob(
                new Blob(
                  [
                    JSON.stringify(
                      {
                        format: "unite-draft-backup",
                        version: 1,
                        draft,
                        settings,
                        started,
                        presets: readPresets(),
                      },
                      null,
                      2,
                    ),
                  ],
                  { type: "application/json" },
                ),
                "unite-draft-backup.json",
              )
            }
            onImport={async (file) => {
              try {
                if (file.size > 2_000_000) throw new Error("Too large");
                const backup = parseBackup(await file.text(), ids);
                setNotice("");
                setPendingBackup(backup);
                setToolsOpen(false);
              } catch {
                setNotice(
                  "対応するバックアップではありません。データは変更していません。",
                );
              }
            }}
          />
        </Modal>
      )}
      {pendingBackup && (
        <Modal
          title="バックアップを読み込みますか？"
          notice={notice}
          onClose={() => setPendingBackup(null)}
        >
          <p>
            現在の進行状況・履歴・設定・プリセットを置き換えます。必要なデータは先にバックアップしてください。
          </p>
          <div className="modal-buttons">
            <button
              className="modal-secondary"
              onClick={() => setPendingBackup(null)}
            >
              キャンセル
            </button>
            <button
              className="modal-primary"
              onClick={() => {
                try {
                  localStorage.setItem(
                    PRESETS_KEY,
                    JSON.stringify(pendingBackup.presets),
                  );
                  setDraft(pendingBackup.draft);
                  setSettings(pendingBackup.settings);
                  setStarted(pendingBackup.started);
                  setDraftSettings({
                    ...pendingBackup.settings,
                    allStar: pendingBackup.draft.allStar,
                    fearless: pendingBackup.draft.seriesRule === "fearless",
                    bestOf: pendingBackup.draft.bestOf,
                  });
                  setRestrictions(pendingBackup.draft.restricted ?? []);
                  setSelected(null);
                  setSwapFrom(null);
                  setQuery("");
                  setRole("all");
                  setRunning(false);
                  setReviewGame(null);
                  setReviewOpen(false);
                  setFirstPrompt(null);
                  setScreen(pendingBackup.started ? "draft" : "setup");
                  setPendingBackup(null);
                  setNotice("バックアップを読み込みました。");
                } catch {
                  setNotice(
                    "読み込みできませんでした。保存領域をご確認ください。",
                  );
                }
              }}
            >
              読み込む
            </button>
          </div>
        </Modal>
      )}
      {modal === "replace" && (
        <Modal title="新しいドラフトを開始" onClose={() => setModal(null)}>
          <p>
            保存済みのドラフトと試合履歴を置き換えます。必要な記録は先にバックアップしてください。
          </p>
          <div className="modal-buttons">
            <button
              className="modal-secondary"
              autoFocus
              onClick={() => setModal(null)}
            >
              キャンセル
            </button>
            <button
              className="modal-primary"
              onClick={() => {
                setModal(null);
                setFirstPrompt("start");
              }}
            >
              新しく開始
            </button>
          </div>
        </Modal>
      )}
      {modal === "reset" && (
        <Modal title="ドラフトをリセット" onClose={() => setModal(null)}>
          <p>
            {draft.allStar
              ? `第${draft.game}試合 の使用禁止・選択だけを消去し、同じ試合を最初からやり直します。過去の試合結果は残ります。`
              : "現在の使用禁止・選択を消去し、この試合を最初からやり直します。"}
          </p>
          <div className="modal-buttons">
            <button className="modal-secondary" onClick={() => setModal(null)}>
              キャンセル
            </button>
            <button
              className="modal-primary"
              onClick={() => {
                setModal(null);
                setFirstPrompt("reset");
              }}
            >
              リセットする
            </button>
          </div>
        </Modal>
      )}
      {firstPrompt && (
        <Modal
          title={
            promptAllStar ? `第${promptGame}試合 の先攻チーム` : "先攻チーム"
          }
          onClose={() => setFirstPrompt(null)}
        >
          <p className="first-prompt-copy">先攻チームを選択</p>
          <div className="first-prompt-options">
            {(["purple", "orange"] as Team[]).map((team) => (
              <button
                key={team}
                className={team}
                ref={team === "purple" ? firstTeamOption : undefined}
                onClick={() => {
                  if (firstPrompt === "start") {
                    startDraft(team);
                  } else if (firstPrompt === "next") {
                    setDraft(nextGame(draft, team));
                    setSelected(null);
                    setSwapFrom(null);
                    setQuery("");
                    setRole("all");
                    setHideUsed(true);
                    setNotice("");
                    setRemaining(turnSeconds(settings.seconds > 0, "ban"));
                    setRunning(settings.seconds > 0);
                    window.scrollTo({ top: 0, behavior: "instant" });
                  } else if (firstPrompt === "reset") {
                    setDraft({
                      ...createDraft(
                        team,
                        draft.allStar,
                        draft.bestOf,
                        draft.seriesRule,
                      ),
                      names: draft.names,
                      restricted: draft.restricted,
                      game: draft.game,
                      history: draft.history,
                      excluded: draft.excluded,
                    });
                    setSelected(null);
                    setSwapFrom(null);
                    setRunning(false);
                    setRemaining(turnSeconds(settings.seconds > 0, "ban"));
                  }
                  setFirstPrompt(null);
                }}
              >
                <span className="side-dot" />
                <span>
                  <strong>
                    {firstPrompt === "start"
                      ? draftSettings[team].trim() || defaults[team]
                      : teamName(team)}
                  </strong>
                  <small>
                    {team === "purple" ? "左側・パープル" : "右側・オレンジ"}
                  </small>
                </span>
                <span>先攻</span>
              </button>
            ))}
          </div>
        </Modal>
      )}
      {reviewOpen && (
        <Modal
          title="試合履歴"
          notice={notice}
          onClose={() => setReviewOpen(false)}
          className={`review-dialog ${reviewGames.length === 1 ? "single-game" : "multi-game"}`}
        >
          {draft.allStar && reviewGames.length > 0 && (
            <button
              className="series-export"
              disabled={seriesBusy}
              onClick={async () => {
                setSeriesBusy(true);
                try {
                  const image = await createSeriesImage(
                    reviewGames,
                    draft.bestOf,
                    settings,
                    draft.seriesRule,
                  );
                  downloadBlob(
                    await fetch(image).then((r) => r.blob()),
                    "unite-draft-series.png",
                  );
                } catch {
                  setNotice("シリーズ画像を作成できませんでした。");
                } finally {
                  setSeriesBusy(false);
                }
              }}
            >
              {seriesBusy ? "画像を作成中…" : "全試合の画像を保存"}
            </button>
          )}
          <div className="past-games-review">
            {reviewGames.map((past) => {
              const first = past.first ?? past.bans?.[0]?.team;
              const gamesAgo = draft.game - past.game;
              return (
                <section className="past-game-review-card" key={past.game}>
                  <button
                    type="button"
                    className="past-game-download"
                    disabled={exportingHistory !== null}
                    onClick={() => void downloadPastResult(past)}
                  >
                    <span>
                      {draft.allStar
                        ? `第${past.game}試合`
                        : gamesAgo === 0
                          ? "最新のドラフト"
                          : gamesAgo === 1
                            ? "直前のドラフト"
                            : `${gamesAgo}試合前のドラフト`}
                    </span>
                    <span>
                      {exportingHistory === past.game
                        ? "画像を作成中…"
                        : "画像を保存"}
                      <Download size={14} />
                    </span>
                  </button>
                  <div className="past-game-review">
                    {(["purple", "orange"] as Team[]).map((team) => (
                      <section key={team} className={team}>
                        <h4>
                          {past.names?.[team] ?? teamName(team)}
                          <span className={`review-order ${team}`}>
                            {first
                              ? first === team
                                ? "先攻"
                                : "後攻"
                              : "順番記録なし"}
                          </span>
                        </h4>
                        <strong>使用禁止</strong>
                        <div className="review-ban-list">
                          {(past.bans
                            ? past.bans.filter((ban) => ban.team === team)
                            : Array.from({ length: 3 }, () => null)
                          ).map((ban, index) => {
                            const p = ban?.pokemon
                              ? byId.get(ban.pokemon)
                              : null;
                            return (
                              <article key={`${team}-ban-${index}`}>
                                {p ? (
                                  <Portrait p={p} />
                                ) : (
                                  <span
                                    className="review-skip-mark"
                                    aria-label={
                                      ban
                                        ? "使用禁止スキップ"
                                        : "使用禁止記録なし"
                                    }
                                  >
                                    —
                                  </span>
                                )}
                              </article>
                            );
                          })}
                        </div>
                        <strong>選択</strong>
                        <div className="review-pick-list">
                          {past.picks
                            .filter((pick) => pick.team === team)
                            .map((pick) => {
                              const p = byId.get(pick.pokemon)!;
                              return (
                                <article key={p.id}>
                                  <Portrait p={p} />
                                </article>
                              );
                            })}
                        </div>
                      </section>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </Modal>
      )}
      {rewindTarget !== null && (
        <Modal
          title={`この${schedule[rewindTarget].phase === "ban" ? "使用禁止" : "選択"}フェーズに戻りますか？`}
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
            {!storageOk && (
              <p role="alert">
                自動保存できていません。画面を閉じる前に、ホームの「その他の設定」からバックアップを保存してください。
              </p>
            )}
            <p>
              <a href={`${import.meta.env.BASE_URL}v2/`}>
                新規デザイン版「Draft 02」を開く
              </a>
            </p>
            <div className="info-preferences">
              <span className="connection">
                <Wifi size={16} />
                {!storageOk
                  ? "未保存"
                  : !online
                    ? "オフライン"
                    : cacheReady
                      ? "オフライン利用可能"
                      : "自動保存"}
              </span>
              <button
                className="subtle-button"
                onClick={() =>
                  setSettings({ ...settings, sound: !settings.sound })
                }
              >
                {settings.sound ? <Volume2 size={18} /> : <VolumeX size={18} />}
                操作音：{settings.sound ? "オン" : "オフ"}
              </button>
            </div>
            <AppInstallPanel />
            <h3>キーボード操作</h3>
            <p>
              矢印：ポケモンを選択 ／ Enter：確定 ／ /：検索 ／ Esc：選択解除 ／
              P：タイマー停止・再開 ／ U：1つ戻す ／ Y：1つ進む。
              文字入力中はショートカットを無効にします。
              先攻選択：左右キーでチーム・閉じるへ移動、Enterで決定、Escで閉じます。
            </p>
            <p>
              1台の端末で両チームを操作する、大会形式のドラフト練習ツールです。ポケモンを選び、中央のボタンで確定してください。
            </p>
            <h3>ドラフト形式の違い</h3>
            <table className="rules-table">
              <caption>過去の試合で選出したポケモンの扱い</caption>
              <thead>
                <tr>
                  <th scope="col">形式</th>
                  <th scope="col">次の試合での制限</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">通常</th>
                  <td>持ち越しなし。毎試合すべて選び直せます。</td>
                </tr>
                <tr>
                  <th scope="row">オールスタードラフト</th>
                  <td>
                    両チームの過去の選出は、両チームとも使用禁止・選択不可。
                  </td>
                </tr>
                <tr>
                  <th scope="row">フィアレス（独自ルール）</th>
                  <td>
                    自チームの過去の選出のみ選択不可。相手は使用可能です。
                  </td>
                </tr>
              </tbody>
            </table>
            <p>
              過去の使用禁止は持ち越しません。フィアレスの使用禁止中は「選択可能のみ」で、相手が過去に選出し再使用できないポケモンも非表示にします。
            </p>
            <p>
              結果画像は右上の「試合履歴・画像保存」から保存できます。シリーズでは全試合を1枚にまとめることもできます。
            </p>
            <h3>大会モード · 各チーム3匹を使用禁止</h3>
            <p>
              使用禁止：先攻 → 後攻を3回繰り返します。
              <br />
              選択：先攻1 → 後攻2 → 先攻2 → 後攻2 → 先攻2 →
              後攻1。2匹選ぶターンはタイマーを共有します。
            </p>
            <p>
              ランクマッチや通常カスタムの投票式使用禁止は対象外です。ミュウツーX・Yとメガシンカの別ライセンスはそれぞれ選択できます。
            </p>
            <h3>公式掲載データ · 2026年10月15日確認</h3>
            <p>
              公式サイト掲載の{pokemon.length}
              枠を収録。未掲載の参戦予告ポケモン、大会ごとの使用制限は含みません。画像は公式素材をWebP化し、このアプリ内から読み込みます。
            </p>
            <h3>保存・オフライン</h3>
            <p>
              進行状況はこのブラウザーに自動保存されます。「オフライン利用可能」の表示後は、再読み込みもオフラインで利用できます。iPhoneはSafariの共有メニューから「ホーム画面に追加」を選べます。
            </p>
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
              © Pokémon / Nintendo / Creatures / GAME FREAK / TiMi。
              <br />
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
