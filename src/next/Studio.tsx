import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowRight,
  CircleMinus,
  UserPlus,
  PanelTop,
  BookOpen,
  Target,
  Repeat2,
  Ban,
  Check,
  ChevronRight,
  Download,
  Ellipsis,
  Grid2X2,
  History,
  House,
  Layers,
  ListFilter,
  Pause,
  Play,
  Redo2,
  RotateCcw,
  Search,
  SkipForward,
  Undo2,
  Users,
  X,
} from "lucide-react";
import { byId, ids, normalize, pokemon, roles } from "../data/roster";
import type { Pokemon, Role } from "../data/roster";
import {
  choose,
  createDraft,
  currentStep,
  nextGame,
  restoreDraft,
  reviewableGames,
  swap,
  unavailable,
  undo,
} from "../domain/draft";
import type { BestOf, Draft, Team } from "../domain/draft";
import { turnSeconds } from "../domain/timer";

const STORE = "unite-draft.studio.v2";
const teams: Team[] = ["purple", "orange"];
const initialNames = {
  purple: "パープル",
  orange: "オレンジ",
  trainers: Array.from({ length: 10 }, (_, i) => `Player ${i + 1}`),
};
type Mode = "standard" | "all-star" | "fearless";
const modes = [
  {
    id: "standard" as Mode,
    name: "通常",
    icon: Target,
    detail: "1試合ずつ選出",
  },
  {
    id: "all-star" as Mode,
    name: "オールスター",
    icon: Layers,
    detail: "過去の選出を両チームで制限",
  },
  {
    id: "fearless" as Mode,
    name: "フィアレス",
    icon: Repeat2,
    detail: "自チームの過去の選出を制限",
  },
];
function load() {
  try {
    const data = JSON.parse(localStorage.getItem(STORE) || "null");
    return {
      draft: restoreDraft(data?.draft, ids),
      timer: data?.timer === true,
    };
  } catch {
    return { draft: null, timer: false };
  }
}
function Sheet({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-labelledby={id}
      onCancel={close}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const r = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            close();
        }
      }}
    >
      <header>
        <h2 id={id}>{title}</h2>
        <button className="icon" aria-label="閉じる" onClick={close}>
          <X />
        </button>
      </header>
      {children}
    </dialog>
  );
}
function Art({ p, className = "" }: { p?: Pokemon; className?: string }) {
  return p ? (
    <img
      className={`art ${className}`}
      src={p.image}
      alt=""
      width="96"
      height="96"
      draggable={false}
    />
  ) : (
    <span className={`art empty-art ${className}`}>
      <Users size={18} />
    </span>
  );
}
export default function Studio() {
  const [saved] = useState(load);
  const [draft, setDraft] = useState<Draft | null>(saved.draft);
  const [home, setHome] = useState(!saved.draft);
  const [mode, setMode] = useState<Mode>(
    saved.draft?.allStar ? saved.draft.seriesRule : "standard",
  );
  const [bestOf, setBestOf] = useState<BestOf>(saved.draft?.bestOf || 3);
  const [names, setNames] = useState(saved.draft?.names || initialNames);
  const [timer, setTimer] = useState(saved.timer);
  const [running, setRunning] = useState(false);
  const [seconds, setSeconds] = useState(15);
  const [selected, setSelected] = useState<string | null>(null);
  const [redo, setRedo] = useState<Draft[]>([]);
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<Role | "all">("all");
  const [available, setAvailable] = useState(true);
  const [newest, setNewest] = useState(false);
  const [pane, setPane] = useState<"roster" | "teams">("roster");
  const [sheet, setSheet] = useState<
    | "start"
    | "next"
    | "settings"
    | "filters"
    | "actions"
    | "reset"
    | "history"
    | "help"
    | null
  >(null);
  const [swapping, setSwapping] = useState<{
    team: Team;
    index: number;
  } | null>(null);
  const [notice, setNotice] = useState("");
  const [storageOk, setStorageOk] = useState(true);
  const [online, setOnline] = useState(navigator.onLine);
  const searchRef = useRef<HTMLInputElement>(null);
  const step = draft ? currentStep(draft) : null;
  const complete = Boolean(draft && !step);
  const active = step?.team || "purple";
  const phase = step?.phase || "pick";
  const label = (team: Team) => draft?.names?.[team] || names[team];
  const picked = selected ? byId.get(selected) : undefined;
  const gameOver = complete && draft?.allStar && draft.game >= draft.bestOf;
  const count = draft?.actions.length || 0;
  const visible = useMemo(
    () =>
      pokemon
        .filter(
          (p) =>
            (role === "all" || p.role === role) &&
            (!query || normalize(p.name + p.id).includes(normalize(query))) &&
            (!available || !draft || !unavailable(draft, p.id)),
        )
        .sort((a, b) =>
          newest ? b.order - a.order : a.name.localeCompare(b.name, "ja"),
        ),
    [role, query, available, draft, newest],
  );
  const commit = (value: Draft) => {
    setDraft(value);
    setRedo([]);
    setSelected(null);
    setSwapping(null);
  };
  const confirm = () => {
    if (draft && selected && !unavailable(draft, selected))
      commit(choose(draft, selected, ids));
  };
  const back = () => {
    if (draft && count) {
      setRedo((s) => [...s, draft]);
      setDraft(undo(draft));
      setSelected(null);
      setSwapping(null);
      setRunning(false);
    }
  };
  const forward = () => {
    const d = redo.at(-1);
    if (d) {
      setDraft(d);
      setRedo((s) => s.slice(0, -1));
      setSelected(null);
      setSwapping(null);
      setRunning(false);
    }
  };
  const begin = (team: Team) => {
    const d =
      sheet === "next" && draft
        ? nextGame(draft, team)
        : {
            ...createDraft(
              team,
              mode !== "standard",
              bestOf,
              mode === "all-star" ? "all-star" : "fearless",
            ),
            names: { ...names, trainers: [...names.trainers] },
          };
    commit(d);
    setHome(false);
    setSheet(null);
    setPane("roster");
    setQuery("");
    setRole("all");
    setRunning(timer);
    setSeconds(turnSeconds(timer, "ban"));
  };
  useEffect(() => {
    try {
      localStorage.setItem(STORE, JSON.stringify({ draft, timer }));
      setStorageOk(true);
    } catch {
      setStorageOk(false);
    }
  }, [draft, timer]);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  useEffect(() => {
    setSeconds(turnSeconds(timer, phase));
  }, [step?.index, draft?.game, timer, phase]);
  useEffect(() => {
    if (!running || !timer || home || sheet || !step) return;
    const id = window.setInterval(
      () => setSeconds((t) => Math.max(0, t - 1)),
      1000,
    );
    return () => clearInterval(id);
  }, [running, timer, home, sheet, step?.index]);
  useEffect(() => {
    if (seconds !== 0 || !running || !timer || !draft) return;
    setRunning(false);
    if (currentStep(draft)?.phase === "ban") {
      commit(choose(draft, null, ids));
      setNotice("時間切れ：BANをスキップ");
    } else setNotice("時間切れ：選択して確定してください");
  }, [seconds, running, timer]);
  useEffect(() => {
    if (complete) setRunning(false);
  }, [complete]);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(id);
  }, [notice]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (home || sheet || e.repeat || e.ctrlKey || e.metaKey || e.altKey)
        return;
      const target = e.target as HTMLElement;
      if (target.closest("input,select,textarea,[contenteditable]")) return;
      if (e.key === "/") {
        e.preventDefault();
        setPane("roster");
        searchRef.current?.focus();
      }
      if (e.key === "Escape") setSelected(null);
      if (e.key.toLowerCase() === "u") {
        e.preventDefault();
        back();
      }
      if (e.key.toLowerCase() === "y") {
        e.preventDefault();
        forward();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });
  function teamCard(team: Team, view: Draft) {
    const picks = view.actions.filter(
      (a) => a.team === team && a.phase === "pick",
    );
    const bans = view.actions.filter(
      (a) => a.team === team && a.phase === "ban",
    );
    const canSwap = complete && view === draft;
    return (
      <section
        key={team}
        className={`team-card ${team}`}
        aria-label={`${view.names?.[team] || label(team)}の選出`}
      >
        <header>
          <span className="team-dot" />
          <h3 title={view.names?.[team] || label(team)}>
            {view.names?.[team] || label(team)}
          </h3>
          <small>{picks.length}/5</small>
        </header>
        <div className="ban-row">
          <Ban size={15} />
          {[0, 1, 2].map((i) => (
            <span
              className="ban-token"
              key={i}
              title={
                bans[i]?.pokemon ? byId.get(bans[i].pokemon!)?.name : "BAN"
              }
            >
              {bans[i]?.pokemon ? (
                <Art p={byId.get(bans[i].pokemon!)} />
              ) : bans[i] ? (
                <SkipForward size={15} />
              ) : (
                <span>—</span>
              )}
            </span>
          ))}
        </div>
        <ol className="pick-list">
          {Array.from({ length: 5 }, (_, i) => {
            const p = byId.get(picks[i]?.pokemon || "");
            return (
              <li key={i}>
                <button
                  className={`pick-slot ${swapping?.team === team && swapping.index === i ? "marked" : ""}`}
                  disabled={!canSwap}
                  onClick={() => {
                    if (!draft) return;
                    if (swapping?.team === team) {
                      commit(swap(draft, team, swapping.index, i));
                    } else setSwapping({ team, index: i });
                  }}
                  aria-label={`${label(team)} ${i + 1}枠 ${p?.name || "未選出"}${canSwap ? " 入れ替え" : ""}`}
                >
                  <span className="slot-number">{i + 1}</span>
                  <Art p={p} />
                  <span className="slot-name">
                    {p?.name || "未選出"}
                    {p && <small>{roles[p.role]}</small>}
                  </span>
                  {p && <Check size={14} />}
                </button>
              </li>
            );
          })}
        </ol>
      </section>
    );
  }
  return (
    <div
      className={`studio ${home ? "is-home" : "is-drafting"} pane-${pane} team-${active}`}
    >
      <header className="appbar">
        <button
          className="wordmark"
          onClick={() => setHome(true)}
          aria-label="ホーム"
        >
          <span className="mark">
            <PanelTop size={21} />
          </span>
          <span>
            Draft <b>02</b>
          </span>
        </button>
        {!home && draft && (
          <div className="turn" aria-live="polite">
            <span className={`turn-badge ${active}`}>
              {complete ? (
                <Check size={15} />
              ) : phase === "ban" ? (
                <Ban size={15} />
              ) : (
                <Check size={15} />
              )}{" "}
              {complete ? "完了" : phase.toUpperCase()}
            </span>
            <strong title={label(active)}>
              {complete ? `GAME ${draft.game}` : label(active)}
            </strong>
            <span className="turn-count">{count}/16</span>
          </div>
        )}
        <div className="appbar-actions">
          {!home && timer && !complete && (
            <button
              className="timer icon"
              aria-label={running ? "タイマーを停止" : "タイマーを開始"}
              onClick={() => {
                if (!seconds) setSeconds(turnSeconds(timer, phase));
                setRunning(!running);
              }}
            >
              <span>{seconds}</span>
              {running ? <Pause size={15} /> : <Play size={15} />}
            </button>
          )}
          <button
            className="icon"
            aria-label="使い方"
            onClick={() => setSheet("help")}
          >
            <BookOpen size={21} />
          </button>
          {!home && (
            <button
              className="icon"
              aria-label="ホームに戻る"
              onClick={() => {
                setHome(true);
                setRunning(false);
              }}
            >
              <House size={21} />
            </button>
          )}
        </div>
      </header>
      {home ? (
        <main className="welcome">
          <div className="welcome-heading">
            <span className="eyebrow">POKÉMON UNITE</span>
            <h1>
              次の一戦を、
              <br />
              ここから。
            </h1>
            <p>選んで、チームをつくる。</p>
          </div>
          <section className="session-card" aria-label="ドラフトの準備">
            <fieldset className="mode-picker">
              <legend>形式</legend>
              <div>
                {modes.map((m) => (
                  <button
                    key={m.id}
                    className={mode === m.id ? "chosen" : ""}
                    aria-pressed={mode === m.id}
                    onClick={() => setMode(m.id)}
                  >
                    <m.icon size={23} />
                    <strong>{m.name}</strong>
                    <small>{m.detail}</small>
                    {mode === m.id && (
                      <Check className="choice-check" size={16} />
                    )}
                  </button>
                ))}
              </div>
            </fieldset>
            {mode !== "standard" && (
              <div className="form-row">
                <span>試合数</span>
                <div className="segments">
                  {([3, 5, 7] as BestOf[]).map((n) => (
                    <button
                      key={n}
                      aria-pressed={bestOf === n}
                      onClick={() => setBestOf(n)}
                    >
                      BO{n}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="form-row">
              <label htmlFor="timer-option">
                ターンタイマー<small>BAN 15秒 · PICK 20秒</small>
              </label>
              <button
                id="timer-option"
                role="switch"
                aria-checked={timer}
                aria-label="ターンタイマー"
                className="switch"
                onClick={() => setTimer(!timer)}
              >
                <span />
              </button>
            </div>
            <button
              className="settings-row"
              onClick={() => setSheet("settings")}
            >
              <Users size={20} />
              <span>チーム名</span>
              <ChevronRight size={18} />
            </button>
            <button className="primary begin" onClick={() => setSheet("start")}>
              対戦を準備
              <ArrowRight size={19} />
            </button>
            {draft && (
              <button className="resume" onClick={() => setHome(false)}>
                <Play size={17} />
                続きから · GAME {draft.game}
                <span>{count}/16</span>
              </button>
            )}
          </section>
          <footer className="welcome-footer">
            <span>102 Pokémon · 非公式ツール</span>
            <a href={import.meta.env.BASE_URL}>現行版へ</a>
          </footer>
        </main>
      ) : (
        draft && (
          <>
            <main className="workspace">
              <nav className="pane-tabs" aria-label="表示切り替え">
                <button
                  aria-pressed={pane === "roster"}
                  onClick={() => setPane("roster")}
                >
                  <Grid2X2 size={18} />
                  ポケモン
                </button>
                <button
                  aria-pressed={pane === "teams"}
                  onClick={() => setPane("teams")}
                >
                  <Users size={18} />
                  チーム
                  <span className="team-counts">
                    {draft.actions.filter((a) => a.phase === "pick").length}/10
                  </span>
                </button>
              </nav>
              <section className="collection" aria-label="ポケモン一覧">
                <div className="collection-toolbar">
                  <label className="search">
                    <Search size={19} />
                    <input
                      ref={searchRef}
                      type="search"
                      placeholder="ポケモンを検索"
                      aria-label="ポケモンを検索"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                    {query && (
                      <button
                        className="icon"
                        aria-label="検索をクリア"
                        onClick={() => setQuery("")}
                      >
                        <X size={17} />
                      </button>
                    )}
                  </label>
                  <button
                    className={`icon filter ${role !== "all" || !available || newest ? "on" : ""}`}
                    aria-label="絞り込みと並び順"
                    aria-haspopup="dialog"
                    onClick={() => setSheet("filters")}
                  >
                    <ListFilter size={21} />
                  </button>
                  <span className="result-count">{visible.length}</span>
                </div>
                <div
                  className="collection-grid"
                  role="group"
                  aria-label="ポケモンを選択"
                  onKeyDown={(e) => {
                    const card = (
                      e.target as HTMLElement
                    ).closest<HTMLButtonElement>(".creature");
                    if (!card) return;
                    const cards = Array.from(
                      e.currentTarget.querySelectorAll<HTMLButtonElement>(
                        ".creature:not(:disabled)",
                      ),
                    );
                    const i = cards.indexOf(card);
                    const cols = getComputedStyle(
                      e.currentTarget,
                    ).gridTemplateColumns.split(" ").length;
                    const delta =
                      e.key === "ArrowRight"
                        ? 1
                        : e.key === "ArrowLeft"
                          ? -1
                          : e.key === "ArrowDown"
                            ? cols
                            : e.key === "ArrowUp"
                              ? -cols
                              : 0;
                    if (delta) {
                      e.preventDefault();
                      const next =
                        cards[
                          Math.max(0, Math.min(cards.length - 1, i + delta))
                        ];
                      next?.focus();
                      if (next?.dataset.id) setSelected(next.dataset.id);
                    }
                  }}
                >
                  {visible.map((p) => (
                    <button
                      key={p.id}
                      data-id={p.id}
                      className={`creature role-${p.role} ${selected === p.id ? "chosen" : ""}`}
                      disabled={complete || unavailable(draft, p.id)}
                      aria-label={p.name}
                      aria-pressed={selected === p.id}
                      onClick={() => setSelected(p.id)}
                    >
                      <Art p={p} />
                      <span className="creature-name">{p.name}</span>
                      <span className="role-dot" aria-label={roles[p.role]} />
                      {selected === p.id && (
                        <span className="selection-check">
                          <Check size={14} />
                        </span>
                      )}
                    </button>
                  ))}
                  {!visible.length && (
                    <div className="no-results">
                      <Search size={32} />
                      <p>見つかりませんでした</p>
                      <button
                        className="secondary"
                        onClick={() => {
                          setQuery("");
                          setRole("all");
                          setAvailable(false);
                        }}
                      >
                        条件をクリア
                      </button>
                    </div>
                  )}
                </div>
              </section>
              <aside className="lineups" aria-label="両チームの選出">
                <div className="lineups-heading">
                  <h2>チーム</h2>
                  <button
                    className="icon"
                    aria-label="試合履歴"
                    onClick={() => setSheet("history")}
                  >
                    <History size={19} />
                  </button>
                </div>
                <div className="team-cards">
                  {teams.map((t) => teamCard(t, draft))}
                </div>
              </aside>
            </main>
            <footer className="command-bar">
              <div className="edit-actions">
                <button
                  className="icon"
                  aria-label="1つ戻す"
                  disabled={!count}
                  onClick={back}
                >
                  <Undo2 size={20} />
                </button>
                <button
                  className="icon redo"
                  aria-label="1つ進む"
                  disabled={!redo.length}
                  onClick={forward}
                >
                  <Redo2 size={20} />
                </button>
                <button
                  className="icon"
                  aria-label="その他の操作"
                  onClick={() => setSheet("actions")}
                >
                  <Ellipsis size={22} />
                </button>
              </div>
              <div className="selection-summary" aria-live="polite">
                {picked && <Art p={picked} />}
                <span>
                  {complete ? "選出完了" : picked?.name || "ポケモンを選択"}
                  <small>
                    {complete
                      ? "チーム画面で入れ替えできます"
                      : step?.remaining === 2
                        ? "このターンは2体選出"
                        : ""}
                  </small>
                </span>
              </div>
              <button
                className="primary commit"
                disabled={!complete && !selected}
                onClick={() =>
                  complete
                    ? gameOver
                      ? setHome(true)
                      : setSheet("next")
                    : confirm()
                }
              >
                {complete ? (
                  gameOver ? (
                    "ホーム"
                  ) : (
                    "次の試合"
                  )
                ) : phase === "ban" ? (
                  <>
                    <CircleMinus size={18} />
                    除外する
                  </>
                ) : (
                  <>
                    <UserPlus size={19} />
                    選出する
                  </>
                )}
                {complete && <ArrowRight size={18} />}
              </button>
            </footer>
          </>
        )
      )}
      {notice && (
        <div className="notice" role="status">
          {notice}
          <button
            className="icon"
            aria-label="通知を閉じる"
            onClick={() => setNotice("")}
          >
            <X size={17} />
          </button>
        </div>
      )}
      {(sheet === "start" || sheet === "next") && (
        <Sheet title="先攻を選択" close={() => setSheet(null)}>
          <div className="first-choice">
            {teams.map((t) => (
              <button className={t} key={t} onClick={() => begin(t)}>
                <span className="team-dot" />
                <strong>{sheet === "next" ? label(t) : names[t]}</strong>
                <ArrowRight size={20} />
              </button>
            ))}
          </div>
        </Sheet>
      )}
      {sheet === "settings" && (
        <Sheet title="チーム名" close={() => setSheet(null)}>
          <div className="name-fields">
            {teams.map((t) => (
              <label key={t}>
                {t === "purple" ? "パープル" : "オレンジ"}
                <input
                  value={names[t]}
                  maxLength={100}
                  onChange={(e) => setNames({ ...names, [t]: e.target.value })}
                />
              </label>
            ))}
          </div>
          <button
            className="primary wide"
            onClick={() => {
              setNames({
                ...names,
                purple: names.purple.trim() || "パープル",
                orange: names.orange.trim() || "オレンジ",
              });
              setSheet(null);
            }}
          >
            完了
          </button>
        </Sheet>
      )}
      {sheet === "filters" && (
        <Sheet title="絞り込みと並び順" close={() => setSheet(null)}>
          <fieldset className="role-picker">
            <legend>バトルスタイル</legend>
            <div>
              <button
                aria-pressed={role === "all"}
                onClick={() => setRole("all")}
              >
                すべて
              </button>
              {(Object.keys(roles) as Role[]).map((r) => (
                <button
                  className={`role-${r}`}
                  key={r}
                  aria-pressed={role === r}
                  onClick={() => setRole(r)}
                >
                  <span className="role-dot" />
                  {roles[r]}
                </button>
              ))}
            </div>
          </fieldset>
          <label className="check-row">
            <input
              type="checkbox"
              checked={available}
              onChange={(e) => setAvailable(e.target.checked)}
            />
            選択できるポケモンのみ
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={newest}
              onChange={(e) => setNewest(e.target.checked)}
            />
            新しい順
          </label>
          <button className="primary wide" onClick={() => setSheet(null)}>
            {visible.length}体を表示
          </button>
        </Sheet>
      )}
      {sheet === "actions" && (
        <Sheet title="操作" close={() => setSheet(null)}>
          <div className="action-list">
            <button
              disabled={!redo.length}
              onClick={() => {
                forward();
                setSheet(null);
              }}
            >
              <Redo2 />
              1つ進む
            </button>
            <button
              disabled={!step || phase !== "ban"}
              onClick={() => {
                if (draft) commit(choose(draft, null, ids));
                setSheet(null);
              }}
            >
              <SkipForward />
              BANをスキップ
            </button>
            <button onClick={() => setSheet("history")}>
              <History />
              試合履歴
            </button>
            <button onClick={() => setSheet("reset")}>
              <RotateCcw />
              この試合をリセット
            </button>
          </div>
        </Sheet>
      )}
      {sheet === "reset" && (
        <Sheet
          title="この試合をリセットしますか？"
          close={() => setSheet(null)}
        >
          <p>この試合のBANとPICKを取り消します。</p>
          <div className="sheet-actions">
            <button className="secondary" onClick={() => setSheet(null)}>
              キャンセル
            </button>
            <button
              className="primary"
              onClick={() => {
                if (draft) commit({ ...draft, actions: [] });
                setRunning(false);
                setSeconds(turnSeconds(timer, "ban"));
                setSheet(null);
              }}
            >
              リセット
            </button>
          </div>
        </Sheet>
      )}
      {sheet === "history" && (
        <Sheet title="試合履歴" close={() => setSheet(null)}>
          <div className="history-list">
            {draft &&
              reviewableGames(draft).map((g) => (
                <section key={g.game}>
                  <h3>GAME {g.game}</h3>
                  {teams.map((t) => (
                    <div className={`history-team ${t}`} key={t}>
                      <strong>{g.names?.[t] || label(t)}</strong>
                      <div>
                        {g.picks
                          .filter((a) => a.team === t)
                          .map((a) => (
                            <span
                              key={a.pokemon}
                              title={byId.get(a.pokemon)?.name}
                            >
                              <Art p={byId.get(a.pokemon)} />
                              <small>{byId.get(a.pokemon)?.name}</small>
                            </span>
                          ))}
                      </div>
                    </div>
                  ))}
                </section>
              ))}
            {(!draft || !reviewableGames(draft).length) && (
              <p>選出が完了するとここに表示されます。</p>
            )}
          </div>
          {draft && (
            <button
              className="secondary wide"
              onClick={() => {
                const url = URL.createObjectURL(
                  new Blob([JSON.stringify({ draft }, null, 2)], {
                    type: "application/json",
                  }),
                );
                const a = document.createElement("a");
                a.href = url;
                a.download = "draft-02.json";
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
              }}
            >
              <Download size={18} />
              記録を保存
            </button>
          )}
        </Sheet>
      )}
      {sheet === "help" && (
        <Sheet title="Draft 02" close={() => setSheet(null)}>
          <div className="help-copy">
            <p>ポケモンを選び、「除外する」「選出する」で確定します。</p>
            <p>
              6 BAN → 10
              PICK。PICK順は1・2・2・2・2・1体。完了後はチームの2枠を選んで入れ替えできます。
            </p>
            <p>矢印キーで選択、Uで戻す、Yで進む、/で検索。</p>
            <p>
              {online ? "オンライン" : "オフライン"} ·{" "}
              {storageOk ? "自動保存中" : "自動保存を利用できません"}
            </p>
            <a href={import.meta.env.BASE_URL}>現行版を開く</a>
            <hr />
            <small>
              非公式のファンツールです。© Pokémon. © Nintendo / Creatures Inc.
              / GAME FREAK inc. Pokémon UNITEの権利は各権利者に帰属します。
            </small>
          </div>
        </Sheet>
      )}
    </div>
  );
}
