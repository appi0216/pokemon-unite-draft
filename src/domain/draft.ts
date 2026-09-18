export type Team = "purple" | "orange";
export type Phase = "ban" | "pick";
export type Action = { team: Team; phase: Phase; pokemon: string | null };
export type Step = { team: Team; phase: Phase; count: number };
export type Draft = {
  first: Team;
  actions: Action[];
  excluded: string[];
  game: number;
  allStar: boolean;
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
): Draft => ({ first, allStar, actions: [], excluded: [], game: 1 });
export const unavailable = (draft: Draft, id: string) =>
  draft.excluded.includes(id) || draft.actions.some((a) => a.pokemon === id);
export function choose(
  draft: Draft,
  pokemon: string | null,
  validIds: readonly string[],
): Draft {
  const step = currentStep(draft);
  if (
    !step ||
    (!pokemon && step.phase === "pick") ||
    (pokemon && (!validIds.includes(pokemon) || unavailable(draft, pokemon)))
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
export function nextGame(draft: Draft): Draft {
  if (currentStep(draft)) return draft;
  const played = draft.actions
    .filter((a) => a.phase === "pick" && a.pokemon)
    .map((a) => a.pokemon!);
  return {
    ...draft,
    game: draft.game + 1,
    first: opposite(draft.first),
    actions: [],
    excluded: draft.allStar ? [...new Set([...draft.excluded, ...played])] : [],
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
  if (
    !["purple", "orange"].includes(v.first) ||
    !Array.isArray(v.actions) ||
    !Array.isArray(v.excluded) ||
    !Number.isInteger(v.game) ||
    v.game < 1 ||
    typeof v.allStar !== "boolean"
  )
    return null;
  if (
    v.excluded.some((id) => typeof id !== "string" || !validIds.includes(id)) ||
    new Set(v.excluded).size !== v.excluded.length
  )
    return null;
  let draft = {
    ...createDraft(v.first, v.allStar),
    excluded: v.excluded,
    game: v.game,
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
