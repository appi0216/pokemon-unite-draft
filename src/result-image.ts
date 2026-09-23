import type { Draft, Team } from "./domain/draft";
import { byId, roles } from "./data/roster";
import measurements from "./data/portrait-layout.json";

/** Render from draft data so the PNG is complete at any viewport or scroll position. */
export async function createResultImage(
  draft: Draft,
  names: Record<Team, string> & { trainers?: string[] },
): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = 1600;
  canvas.height = 1180;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  await document.fonts.ready;
  const images = new Map<string, HTMLImageElement>();
  await Promise.all(
    [
      ...new Set(draft.actions.flatMap((a) => (a.pokemon ? [a.pokemon] : []))),
    ].map(async (id) => {
      const img = new Image();
      img.src = byId.get(id)!.image;
      await img.decode();
      images.set(id, img);
    }),
  );
  const text = (
    value: string,
    x: number,
    y: number,
    size = 22,
    color = "#493c5b",
    max = 650,
  ) => {
    ctx.font = `600 ${size}px -apple-system, BlinkMacSystemFont, "Segoe UI", "Yu Gothic", sans-serif`;
    ctx.fillStyle = color;
    ctx.fillText(value, x, y, max);
  };
  const box = (x: number, y: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 20);
    ctx.fill();
  };
  const portrait = (id: string, x: number, y: number, size: number) => {
    const m = (
      measurements as Record<
        string,
        { width: number; left: number; top: number }
      >
    )[id];
    ctx.drawImage(
      images.get(id)!,
      x + (size * m.left) / 100,
      y + (size * m.top) / 100,
      (size * m.width) / 100,
      (size * m.width) / 100,
    );
  };
  ctx.fillStyle = "#f5f3fa";
  ctx.fillRect(0, 0, 1600, 1180);
  text("UNITE DRAFT", 60, 76, 36);
  text(
    draft.allStar
      ? `ALL-STAR · BO${draft.bestOf} · GAME ${String(draft.game).padStart(2, "0")}`
      : "DRAFT RESULT",
    60,
    117,
    20,
    "#857292",
  );
  text("3 BAN / 5 PICK", 1250, 80, 24, "#857292", 300);
  for (const [index, team] of (["purple", "orange"] as const).entries()) {
    const x = 60 + index * 760;
    const color = team === "purple" ? "#8052c2" : "#b67532";
    box(x, 154, 720, 934, "#ffffff");
    box(x + 22, 176, 676, 74, team === "purple" ? "#f0e8fb" : "#fcf0df");
    text(names[team], x + 42, 223, 29, color, 535);
    text(draft.first === team ? "先攻" : "後攻", x + 604, 221, 20, color, 80);
    text("BAN · 使用禁止", x + 30, 291, 18, "#89778f");
    draft.actions
      .filter((a) => a.team === team && a.phase === "ban")
      .forEach((a, i) => {
        const bx = x + 26 + i * 226;
        box(bx, 309, 216, 142, "#f4f1f7");
        if (a.pokemon) portrait(a.pokemon, bx + 64, 310, 90);
        text(
          a.pokemon ? byId.get(a.pokemon)!.name : "スキップ",
          bx + 12,
          432,
          18,
          "#7f6b86",
          192,
        );
      });
    text("PICK · 選出ポケモン", x + 30, 496, 18, "#89778f");
    draft.actions
      .filter((a) => a.team === team && a.phase === "pick")
      .forEach((a, i) => {
        const y = 516 + i * 109;
        const p = byId.get(a.pokemon!)!;
        box(x + 26, y, 668, 98, team === "purple" ? "#f6f1fc" : "#fcf7ef");
        text(String(i + 1).padStart(2, "0"), x + 40, y + 58, 20, "#a193aa", 36);
        portrait(p.id, x + 82, y + 1, 96);
        text(p.name, x + 201, y + 42, 26, color, 450);
        text(`${roles[p.role]}型`, x + 202, y + 76, 17, "#89778f", 450);
        text(
          names.trainers?.[team === "purple" ? i : i + 5] ??
            `Trainer ${team === "purple" ? i + 1 : i + 6}`,
          x + 500,
          y + 76,
          15,
          "#89778f",
          175,
        );
      });
  }
  text("非公式ファンメイドツール · Pokémon UNITE", 60, 1132, 17, "#92849b");
  text(
    "© Pokémon / Nintendo / Creatures / GAME FREAK / TiMi",
    60,
    1159,
    14,
    "#92849b",
  );
  return canvas.toDataURL("image/png");
}
