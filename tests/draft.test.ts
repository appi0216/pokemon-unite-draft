import test from "node:test";
import assert from "node:assert/strict";
import {
  choose,
  createDraft,
  currentStep,
  nextGame,
  restoreDraft,
  steps,
  swap,
  undo,
} from "../src/domain/draft.ts";
const ids = Array.from({ length: 80 }, (_, i) => `p${i}`);
test("six alternating bans, then exact 1-2-2-2-2-1 pick groups, either first team", () => {
  for (const first of ["purple", "orange"] as const) {
    let d = createDraft(first);
    const second = first === "purple" ? "orange" : "purple";
    const sequence = [
      first,
      second,
      first,
      second,
      first,
      second,
      first,
      second,
      second,
      first,
      first,
      second,
      second,
      first,
      first,
      second,
    ];
    sequence.forEach((team, i) => {
      assert.equal(currentStep(d)?.team, team);
      assert.equal(currentStep(d)?.phase, i < 6 ? "ban" : "pick");
      d = choose(d, ids[i], ids);
    });
    assert.equal(currentStep(d), null);
    assert.equal(choose(d, ids[20], ids), d);
    assert.deepEqual(
      steps(first)
        .slice(6)
        .map((s) => s.count),
      [1, 2, 2, 2, 2, 1],
    );
  }
});
test("banned, already picked and unknown Pokemon cannot be chosen; ban skip is permitted", () => {
  let d = createDraft();
  d = choose(d, ids[0], ids);
  assert.equal(choose(d, ids[0], ids), d);
  assert.equal(choose(d, "missing", ids), d);
  for (let i = 1; i < 6; i++) d = choose(d, null, ids);
  assert.equal(d.actions.length, 6);
  assert.equal(choose(d, null, ids), d);
  d = choose(d, ids[1], ids);
  assert.equal(choose(d, ids[1], ids), d);
  assert.equal(undo(d).actions.length, 6);
});
test("two-pick turn keeps its step after the first choice", () => {
  let d = createDraft();
  for (let i = 0; i < 7; i++) d = choose(d, ids[i], ids);
  const index = currentStep(d)?.index;
  assert.equal(currentStep(d)?.remaining, 2);
  d = choose(d, ids[7], ids);
  assert.equal(currentStep(d)?.index, index);
  assert.equal(currentStep(d)?.remaining, 1);
  d = choose(d, ids[8], ids);
  assert.equal(currentStep(d)?.index, index! + 1);
});
test("All-Star carries only picks, cumulatively, and alternates first team", () => {
  let d = createDraft("purple", true);
  for (let i = 0; i < 16; i++) d = choose(d, ids[i], ids);
  d = nextGame(d);
  assert.equal(d.game, 2);
  assert.equal(d.first, "orange");
  assert.deepEqual(d.excluded, ids.slice(6, 16));
  assert.equal(choose(d, ids[7], ids), d);
  assert.equal(choose(d, ids[0], ids).actions.length, 1);
  for (let i = 16; i < 32; i++) d = choose(d, ids[i], ids);
  d = nextGame(d);
  assert.equal(d.excluded.length, 20);
  assert.equal(nextGame(d), d);
});
test("normal next game clears bans/picks; swapping only within completed team", () => {
  let d = createDraft();
  assert.equal(swap(d, "purple", 0, 1), d);
  for (let i = 0; i < 16; i++) d = choose(d, ids[i], ids);
  const switched = swap(d, "purple", 0, 4);
  assert.equal(switched.actions[6].pokemon, ids[14]);
  assert.equal(switched.actions[14].pokemon, ids[6]);
  assert.equal(switched.actions[7].pokemon, d.actions[7].pokemon);
  assert.deepEqual(nextGame(d).excluded, []);
  assert.deepEqual(nextGame(d), createDraft("purple"));
  let right = createDraft("orange");
  for (let i = 0; i < 16; i++) right = choose(right, ids[i], ids);
  assert.deepEqual(nextGame(right), createDraft("orange"));
});
test("All-Star records each team's final picks across games and restores ownership", () => {
  let d = createDraft("purple", true);
  for (let i = 0; i < 16; i++) d = choose(d, ids[i], ids);
  d = swap(d, "purple", 0, 4);
  const firstPicks = d.actions
    .filter((a) => a.phase === "pick")
    .map(({ team, pokemon }) => ({ team, pokemon }));
  d = nextGame(d);
  assert.deepEqual(d.history, [{ game: 1, picks: firstPicks }]);
  assert.deepEqual(
    d.history[0].picks.filter((p) => p.team === "purple").map((p) => p.pokemon),
    [ids[14], ids[9], ids[10], ids[13], ids[6]],
  );
  for (let i = 16; i < 32; i++) d = choose(d, ids[i], ids);
  d = nextGame(d);
  assert.equal(d.history.length, 2);
  assert.deepEqual(restoreDraft(JSON.parse(JSON.stringify(d)), ids), d);
  assert.equal(undo(d).history.length, 2);
  assert.equal(createDraft("purple", true).history.length, 0);
  const corrupt = JSON.parse(JSON.stringify(d));
  corrupt.history[0].picks[0].team = "unknown";
  assert.equal(restoreDraft(corrupt, ids), null);
});
test("legacy saves keep bans from prior picks without inventing team history", () => {
  let d = createDraft("purple", true);
  for (let i = 0; i < 16; i++) d = choose(d, ids[i], ids);
  d = nextGame(d);
  const { history, ...legacy } = d;
  const restored = restoreDraft(legacy, ids)!;
  assert.deepEqual(restored.history, []);
  assert.deepEqual(restored.excluded, ids.slice(6, 16));
  assert.equal(choose(restored, ids[6], ids), restored);
  assert.equal(
    restoreDraft({ ...createDraft(), game: 8, history: undefined }, ids)?.game,
    1,
  );
});
test("stored data is validated and invalid progress never loaded", () => {
  let d = createDraft();
  d = choose(d, ids[0], ids);
  assert.deepEqual(restoreDraft(d, ids), d);
  assert.equal(
    restoreDraft({ ...d, actions: [...d.actions, ...d.actions] }, ids),
    null,
  );
  assert.equal(restoreDraft({ ...d, excluded: ["missing"] }, ids), null);
  assert.equal(restoreDraft({ first: "anything" }, ids), null);
});
test("malformed missing Pokemon is rejected when restoring a ban", () => {
  const d = createDraft();
  assert.equal(
    restoreDraft({ ...d, actions: [{ team: "purple", phase: "ban" }] }, ids),
    null,
  );
});
