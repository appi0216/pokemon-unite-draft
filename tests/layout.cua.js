// Run through the CUA browser runtime against a completed draft.
// Pass the bound tab and browser viewport capability. No next-game or reset action
// is used; undo/redo restores the result after each measurement, even on failure.
export async function checkDraftLayout(tab, viewport) {
  const measure = () =>
    tab.playwright.evaluate(() => {
      const b = document.querySelector(".decision-main > .confirm-button");
      const r = b.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    });
  const stable = async () => {
    let last = await measure();
    for (let i = 0; i < 30; i++) {
      const next = await measure();
      if (Object.keys(next).every((k) => Math.abs(next[k] - last[k]) < 0.01))
        return next;
      last = next;
    }
    throw new Error("Action button did not settle");
  };
  if (!(await tab.playwright.locator(".app.draft-complete").count()))
    throw new Error("Open an existing completed draft first");
  const results = [];
  let undone = false;
  try {
    for (const [width, height] of [
      [1920, 1080],
      [1440, 900],
      [1280, 720],
      [1024, 768],
      [800, 800],
      [390, 844],
    ]) {
      await viewport.set({ width, height });
      const completed = await stable();
      await tab.playwright
        .getByRole("button", { name: "1つ戻す", exact: true })
        .click();
      undone = true;
      const active = await stable();
      const card = tab.playwright
        .locator(".pokemon-card:not(:disabled)")
        .first();
      await card.click();
      const selected = await stable();
      await card.press("Escape");
      const cleared = await stable();
      await tab.playwright
        .getByRole("button", { name: "1つ進む", exact: true })
        .click();
      undone = false;
      const restored = await stable();
      const states = [active, selected, cleared, restored];
      const aligned = states.every((s) =>
        Object.keys(completed).every((k) => Math.abs(s[k] - completed[k]) <= 1),
      );
      const fits =
        completed.x >= 0 &&
        completed.y >= 0 &&
        completed.x + completed.width <= width + 1 &&
        completed.y + completed.height <= height + 1;
      results.push({
        width,
        height,
        aligned,
        fits,
        completed,
        active,
        selected,
        cleared,
        restored,
      });
      if (!aligned || !fits) throw new Error(JSON.stringify(results));
    }
    return results;
  } finally {
    if (undone)
      await tab.playwright
        .getByRole("button", { name: "1つ進む", exact: true })
        .click();
    await viewport.reset();
  }
}
