export type Team = "purple" | "orange";
export type Phase = "ban" | "pick";
export type BestOf = 3 | 5 | 7;
export type SeriesRule = "all-star" | "fearless";
export type Action = { team: Team; phase: Phase; pokemon: string | null };
export type Step = { team: Team; phase: Phase; count: number };
export type Names = { purple: string; orange: string; trainers: string[] };
export function validNames(v: unknown): v is Names {
  if (!v || typeof v !== "object") return false;
  const n = v as Names;
  return (
    [n.purple, n.orange].every(
      (x) => typeof x === "string" && x.length <= 100,
    ) &&
    Array.isArray(n.trainers) &&
    n.trainers.length === 10 &&
    n.trainers.every((x) => typeof x === "string" && x.length <= 100)
  );
}
export type PastGame = {
  names?: Names;
  game: number;
  first?: Team;
  bans?: { team: Team; pokemon: string | null }[];
  picks: { team: Team; pokemon: string }[];
};
export type Draft = {
  names?: Names;
  restricted?: string[];
  first: Team;
  actions: Action[];
  excluded: string[];
  game: number;
  allStar: boolean;
  seriesRule: SeriesRule;
  history: PastGame[];
  bestOf: BestOf;
};
export const opposite = (team: Team): Team =>
  team === "purple" ? "orange" : "purple";
export function steps(first: Team): Step[] {
  const second = opposite(first);
  return [first, second, first, second, first, second]
    .map((team) => ({ team, phase: "ban" as Phase, count: 1 }))
    .concat(
      [first, second, first, second, first, second].map((team, i) => ({
        team,
        phase: "pick" as Phase,
        count: i === 0 || i === 5 ? 1 : 2,
      })),
    );
}
export function currentStep(draft: Draft) {
  let consumed = 0;
  for (const [index, step] of steps(draft.first).entries()) {
    if (draft.actions.length < consumed + step.count)
      return {
        ...step,
        index,
        chosen: draft.actions.length - consumed,
        remaining: consumed + step.count - draft.actions.length,
      };
    consumed += step.count;
  }
  return null;
}
export const createDraft = (
  first: Team = "purple",
  allStar = false,
  bestOf: BestOf = 3,
  seriesRule: SeriesRule = "fearless",
): Draft => ({
  first,
  allStar,
  seriesRule,
  actions: [],
  excluded: [],
  game: 1,
  history: [],
  bestOf,
});
export function unavailable(draft: Draft, id: string, team?: Team) {
  if (draft.restricted?.includes(id)) return true;
  if (draft.actions.some((a) => a.pokemon === id)) return true;

  if (!draft.allStar) return false;

  // Official All-Star: every Pokémon picked by either team is unavailable to
  // both teams during all later BAN and PICK phases.
  if (draft.seriesRule === "all-star")
    return (
      draft.excluded.includes(id) ||
      draft.history.some((game) =>
        game.picks.some((pick) => pick.pokemon === id),
      )
    );

  const step = currentStep(draft);
  if (step?.phase !== "pick") return false;
  const pickingTeam = team ?? step.team;

  // Fearless saves retain the owner of every past pick. A Pokémon is
  // therefore unavailable only to the team that used it in an earlier game.
  if (draft.history.length)
    return draft.history.some((game) =>
      game.picks.some(
        (pick) => pick.team === pickingTeam && pick.pokemon === id,
      ),
    );

  // Saved drafts from before team ownership was recorded have no way to tell
  // who used a Pokémon. Keep their former, global restriction intact.
  return draft.excluded.includes(id);
}

/** Fearless-only hint: banning a Pokémon the opponent already used has no value. */
export function redundantAllStarBan(draft: Draft, id: string, team?: Team) {
  const step = currentStep(draft);
  if (
    !draft.allStar ||
    draft.seriesRule !== "fearless" ||
    step?.phase !== "ban"
  )
    return false;
  const opponent = opposite(team ?? step.team);
  return draft.history.some((game) =>
    game.picks.some((pick) => pick.team === opponent && pick.pokemon === id),
  );
}
export function choose(
  draft: Draft,
  pokemon: string | null,
  validIds: readonly string[],
): Draft {
  const step = currentStep(draft);
  if (
    !step ||
    (!pokemon && step.phase === "pick") ||
    (pokemon &&
      (!validIds.includes(pokemon) || unavailable(draft, pokemon, step.team)))
  )
    return draft;
  return {
    ...draft,
    actions: [
      ...draft.actions,
      { team: step.team, phase: step.phase, pokemon },
    ],
  };
}
export const undo = (draft: Draft): Draft => ({
  ...draft,
  actions: draft.actions.slice(0, -1),
});

/**
 * Games available in the review UI. The completed current All-Star game is
 * derived instead of persisted, so undo/reset removes it without touching
 * the safely stored results of earlier games.
 */
export function reviewableGames(draft: Draft): PastGame[] {
  const games = [...draft.history];
  if (currentStep(draft) || games.some((game) => game.game === draft.game))
    return games;

  const reviewable = [
    ...games,
    {
      game: draft.game,
      ...(draft.names ? { names: draft.names } : {}),
      first: draft.first,
      bans: draft.actions
        .filter((action) => action.phase === "ban")
        .map(({ team, pokemon }) => ({ team, pokemon })),
      picks: draft.actions
        .filter((action) => action.phase === "pick" && action.pokemon)
        .map(({ team, pokemon }) => ({ team, pokemon: pokemon! })),
    },
  ];
  return draft.allStar ? reviewable : reviewable.slice(-5);
}

/** Rebuild a completed draft so a past result can be exported as an image. */
export function draftFromPastGame(
  past: PastGame,
  bestOf: BestOf = 3,
  allStar = false,
  seriesRule: SeriesRule = "fearless",
): Draft {
  return {
    ...(past.names ? { names: past.names } : {}),
    first: past.first ?? past.bans?.[0]?.team ?? "purple",
    actions: [
      ...(past.bans ?? []).map(({ team, pokemon }) => ({
        team,
        phase: "ban" as Phase,
        pokemon,
      })),
      ...past.picks.map(({ team, pokemon }) => ({
        team,
        phase: "pick" as Phase,
        pokemon,
      })),
    ],
    excluded: [],
    game: past.game,
    allStar,
    seriesRule,
    history: [],
    bestOf,
  };
}

function completedGame(draft: Draft): PastGame {
  return {
    game: draft.game,
    ...(draft.names ? { names: draft.names } : {}),
    first: draft.first,
    bans: draft.actions
      .filter((action) => action.phase === "ban")
      .map(({ team, pokemon }) => ({ team, pokemon })),
    picks: draft.actions
      .filter((action) => action.phase === "pick" && action.pokemon)
      .map(({ team, pokemon }) => ({ team, pokemon: pokemon! })),
  };
}

export function rewindToStep(draft: Draft, index: number): Draft {
  const sequence = steps(draft.first);
  if (!Number.isInteger(index) || index < 0 || index >= sequence.length)
    return draft;
  const actionCount = sequence
    .slice(0, index)
    .reduce((total, step) => total + step.count, 0);
  if (actionCount >= draft.actions.length) return draft;
  return { ...draft, actions: draft.actions.slice(0, actionCount) };
}
export function nextGame(draft: Draft, first?: Team): Draft {
  if (currentStep(draft)) return draft;
  if (!draft.allStar) {
    return {
      ...createDraft(first ?? draft.first),
      game: draft.game + 1,
      ...(draft.names ? { names: draft.names } : {}),
      ...(draft.restricted ? { restricted: draft.restricted } : {}),
      history: [...draft.history, completedGame(draft)].slice(-5),
    };
  }
  if (draft.game >= draft.bestOf) return draft;
  const played = draft.actions
    .filter((a) => a.phase === "pick" && a.pokemon)
    .map((a) => a.pokemon!);
  return {
    ...draft,
    game: draft.game + 1,
    ...(draft.names ? { names: draft.names } : {}),
    ...(draft.restricted ? { restricted: draft.restricted } : {}),
    first: first ?? opposite(draft.first),
    actions: [],
    excluded: draft.allStar ? [...new Set([...draft.excluded, ...played])] : [],
    history: [...draft.history, completedGame(draft)],
  };
}
export function swap(
  draft: Draft,
  team: Team,
  first: number,
  second: number,
): Draft {
  if (currentStep(draft)) return draft;
  const indices = draft.actions
    .map((a, i) => (a.team === team && a.phase === "pick" ? i : -1))
    .filter((i) => i >= 0);
  if (
    !Number.isInteger(first) ||
    !Number.isInteger(second) ||
    indices[first] === undefined ||
    indices[second] === undefined
  )
    return draft;
  const actions = draft.actions.map((a) => ({ ...a }));
  [actions[indices[first]].pokemon, actions[indices[second]].pokemon] = [
    actions[indices[second]].pokemon,
    actions[indices[first]].pokemon,
  ];
  return { ...draft, actions };
}
export function restoreDraft(
  value: unknown,
  validIds: readonly string[],
): Draft | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Draft;
  if (v.names !== undefined && !validNames(v.names)) return null;
  if (
    v.restricted !== undefined &&
    (!Array.isArray(v.restricted) ||
      v.restricted.some((id) => !validIds.includes(id)) ||
      new Set(v.restricted).size !== v.restricted.length)
  )
    return null;
  const bestOf = v.bestOf ?? (v.game > 3 ? 5 : 3);
  if (bestOf !== 3 && bestOf !== 5 && bestOf !== 7) return null;
  if (
    !["purple", "orange"].includes(v.first) ||
    !Array.isArray(v.actions) ||
    !Array.isArray(v.excluded) ||
    !Number.isInteger(v.game) ||
    v.game < 1 ||
    typeof v.allStar !== "boolean"
  )
    return null;
  const seriesRule: SeriesRule =
    v.seriesRule === "all-star" || v.seriesRule === "fearless"
      ? v.seriesRule
      : "fearless";
  if (
    v.excluded.some((id) => typeof id !== "string" || !validIds.includes(id)) ||
    new Set(v.excluded).size !== v.excluded.length
  )
    return null;
  // Older saves have exclusions but no team attribution. Keep those exclusions
  // without inventing ownership; new games record the full team history.
  const history = v.history === undefined ? [] : v.history;
  if (!Array.isArray(history)) return null;
  const usedByTeam: Record<Team, Set<string>> = {
    purple: new Set<string>(),
    orange: new Set<string>(),
  };
  const usedGlobally = new Set<string>();
  let lastGame = 0;
  for (const past of history) {
    if (
      !past ||
      !Number.isInteger(past.game) ||
      past.game <= lastGame ||
      past.game >= v.game ||
      !Array.isArray(past.picks) ||
      past.picks.length !== 10
    )
      return null;
    if (past.names !== undefined && !validNames(past.names)) return null;
    lastGame = past.game;
    if (past.first !== undefined && !["purple", "orange"].includes(past.first))
      return null;
    if (past.bans !== undefined) {
      if (
        !Array.isArray(past.bans) ||
        past.bans.length !== 6 ||
        past.bans.some(
          (ban) =>
            !ban ||
            !["purple", "orange"].includes(ban.team) ||
            (ban.pokemon !== null &&
              (typeof ban.pokemon !== "string" ||
                !validIds.includes(ban.pokemon))),
        ) ||
        past.bans.filter((ban) => ban.team === "purple").length !== 3 ||
        past.bans.filter((ban) => ban.team === "orange").length !== 3
      )
        return null;
    }
    for (const pick of past.picks) {
      if (
        !pick ||
        !["purple", "orange"].includes(pick.team) ||
        typeof pick.pokemon !== "string" ||
        !validIds.includes(pick.pokemon) ||
        (v.allStar &&
          (!v.excluded.includes(pick.pokemon) ||
            (seriesRule === "all-star"
              ? usedGlobally.has(pick.pokemon)
              : usedByTeam[pick.team].has(pick.pokemon))))
      )
        return null;
      usedByTeam[pick.team].add(pick.pokemon);
      usedGlobally.add(pick.pokemon);
    }
    if (past.picks.filter((p) => p.team === "purple").length !== 5) return null;
    if (past.picks.filter((p) => p.team === "orange").length !== 5) return null;
  }
  if (!v.allStar && (v.excluded.length || history.length > 5)) return null;
  let draft: Draft = {
    ...createDraft(v.first, v.allStar, bestOf, seriesRule),
    ...(v.names ? { names: v.names } : {}),
    ...(v.restricted ? { restricted: v.restricted } : {}),
    excluded: v.excluded,
    game: v.game,
    history,
  };
  for (const a of v.actions) {
    const step = currentStep(draft);
    if (
      !a ||
      !step ||
      a.team !== step.team ||
      a.phase !== step.phase ||
      (a.pokemon !== null && typeof a.pokemon !== "string")
    )
      return null;
    const result = choose(draft, a.pokemon, validIds);
    if (result === draft) return null;
    draft = result;
  }
  return draft;
}
