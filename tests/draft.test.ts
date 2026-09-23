import test from "node:test";
import assert from "node:assert/strict";
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
} from "../src/domain/draft.ts";
const ids = Array.from({ length: 80 }, (_, i) => `p${i}`);
import { turnSeconds } from "../src/domain/timer.ts";

const finishDraft = (draft: ReturnType<typeof createDraft>) => {
  let finished = draft;
  for (let i = 0; i < 16; i++) finished = choose(finished, ids[i], ids);
  return finished;
};

test("timer follows six BAN turns and shared two-pick turns", () => {
  let d = createDraft();
  for (let i = 0; i < 6; i++) {
    assert.equal(turnSeconds(true, currentStep(d)!.phase), 15);
    d = choose(d, null, ids);
  }
  assert.equal(turnSeconds(true, currentStep(d)!.phase), 20);
  d = choose(d, ids[0], ids);
  const sharedTurn = currentStep(d)!.index;
  d = choose(d, ids[1], ids);
  assert.equal(currentStep(d)!.index, sharedTurn);
  assert.equal(turnSeconds(true, currentStep(d)!.phase), 20);
  d = choose(d, ids[2], ids);
  assert.notEqual(currentStep(d)!.index, sharedTurn);
  assert.equal(turnSeconds(false, "ban"), 0);
  assert.equal(turnSeconds(false, "pick"), 0);
});
test("BO3, BO5 and BO7 stop at their final draft and survive reload", () => {
  for (const bestOf of [3, 5, 7] as const) {
    let d = createDraft("purple", true, bestOf);
    for (let game = 1; game <= bestOf; game++) {
      for (let i = 0; i < 6; i++) d = choose(d, null, ids);
      for (let i = 0; i < 10; i++) d = choose(d, ids[(game - 1) * 10 + i], ids);
      assert.equal(currentStep(d), null);
      const restored = restoreDraft(JSON.parse(JSON.stringify(d)), ids)!;
      assert.equal(restored.bestOf, bestOf);
      assert.equal(restored.game, game);
      if (game === bestOf) assert.equal(nextGame(d), d);
      else {
        d = nextGame(d);
        assert.equal(d.game, game + 1);
      }
    }
  }
  assert.equal(restoreDraft({ ...createDraft(), bestOf: 4 }, ids), null);
});
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
test("rewinding a progress step removes later choices but keeps prior games", () => {
  let d = createDraft("purple", true);
  for (let i = 0; i < 16; i++) d = choose(d, ids[i], ids);
  d = nextGame(d);
  for (let i = 16; i < 25; i++) d = choose(d, ids[i], ids);
  const atPickStart = rewindToStep(d, 7);
  assert.equal(atPickStart.actions.length, 7);
  assert.equal(currentStep(atPickStart)?.index, 7);
  assert.equal(currentStep(atPickStart)?.remaining, 2);
  assert.deepEqual(atPickStart.history, d.history);
  assert.deepEqual(atPickStart.excluded, d.excluded);
  assert.equal(rewindToStep(d, 9), d);
  assert.equal(rewindToStep(d, -1), d);
  assert.equal(rewindToStep(d, 12), d);
  assert.equal(rewindToStep(d, 1.5), d);
  assert.equal(
    restoreDraft(JSON.parse(JSON.stringify(atPickStart)), ids)?.actions.length,
    7,
  );
  for (let i = 25; i < 32; i++) d = choose(d, ids[i], ids);
  assert.equal(currentStep(d), null);
  const fromComplete = rewindToStep(d, 11);
  assert.equal(fromComplete.actions.length, 15);
  assert.equal(currentStep(fromComplete)?.index, 11);
  assert.deepEqual(fromComplete.history, d.history);
});
test("All-Star locks prior picks only for the team that used them", () => {
  let d = createDraft("purple", true);
  for (let i = 0; i < 16; i++) d = choose(d, ids[i], ids);
  d = nextGame(d);
  assert.equal(d.game, 2);
  assert.equal(d.first, "orange");
  assert.deepEqual(d.excluded, ids.slice(6, 16));
  // Earlier picks do not restrict BAN choices in the next game.
  d = choose(d, ids[7], ids);
  assert.equal(d.actions.length, 1);
  for (let i = 1; i < 6; i++) d = choose(d, null, ids);
  // Purple used p6 in game one, so orange may pick it in game two.
  assert.equal(unavailable(d, ids[6], "orange"), false);
  d = choose(d, ids[6], ids);
  assert.equal(d.actions.length, 7);
  // Orange used p7 in game one, so orange cannot use it again.
  assert.equal(unavailable(d, ids[7], "orange"), true);
  assert.equal(choose(d, ids[7], ids), d);
  for (let i = 16; i < 25; i++) d = choose(d, ids[i], ids);
  d = nextGame(d);
  assert.equal(d.excluded.length, 19);
  assert.equal(nextGame(d), d);
});
test("available-only BAN filter excludes the opponent's past picks for each team", () => {
  let d = createDraft("purple", true);
  for (let i = 0; i < 16; i++) d = choose(d, ids[i], ids);
  d = nextGame(d);
  // Orange bans first in game two. Purple's old pick is redundant for Orange.
  assert.equal(redundantAllStarBan(d, ids[6], "orange"), true);
  assert.equal(redundantAllStarBan(d, ids[7], "orange"), false);
  // Purple may still pick its opponent's old Pokémon in a later game.
  assert.equal(unavailable(d, ids[7], "purple"), false);
  d = choose(d, null, ids);
  assert.equal(redundantAllStarBan(d, ids[7], "purple"), true);
  assert.equal(redundantAllStarBan(d, ids[6], "purple"), false);
  // The filter does not change the underlying BAN rule.
  assert.equal(choose(d, ids[7], ids).actions.length, 2);
  for (let i = 1; i < 6; i++) d = choose(d, null, ids);
  assert.equal(redundantAllStarBan(d, ids[7], "purple"), false);
  assert.equal(redundantAllStarBan(createDraft(), ids[7]), false);
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

test("next game accepts an independently selected first team", () => {
  let d = finishDraft(createDraft("purple"));
  assert.equal(nextGame(d, "orange").first, "orange");
  assert.equal(nextGame(d, "purple").first, "purple");

  d = finishDraft(createDraft("purple", true, 3));
  assert.equal(nextGame(d, "purple").first, "purple");
  assert.equal(nextGame(d, "orange").first, "orange");
});

test("All-Star records each team's final picks across games and restores ownership", () => {
  let d = createDraft("purple", true);
  for (let i = 0; i < 16; i++) d = choose(d, ids[i], ids);
  d = swap(d, "purple", 0, 4);
  const firstPicks = d.actions
    .filter((a) => a.phase === "pick")
    .map(({ team, pokemon }) => ({ team, pokemon }));
  d = nextGame(d);
  assert.equal(d.history.length, 1);
  assert.equal(d.history[0].game, 1);
  assert.equal(d.history[0].first, "purple");
  assert.deepEqual(d.history[0].picks, firstPicks);
  assert.deepEqual(
    d.history[0].bans?.map((ban) => ban.pokemon),
    ids.slice(0, 6),
  );
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
  let pickStep = restored;
  for (let i = 0; i < 6; i++) pickStep = choose(pickStep, null, ids);
  assert.equal(choose(pickStep, ids[6], ids), pickStep);
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
