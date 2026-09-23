import type { Draft, Team } from "./domain/draft";
import { byId, roles } from "./data/roster";
import measurements from "./data/portrait-layout.json";

const palette = {
  background: "#07171f",
  surface: "#10242d",
  raised: "#162d36",
  border: "#31515b",
  cyan: "#69cad9",
  text: "#f2f8fa",
  secondary: "#a9bec4",
  muted: "#789098",
  purple: "#7952e8",
  orange: "#e89748",
  attack: "#f16c56",
  balance: "#b778cf",
  defense: "#94c85a",
  speed: "#51b9d9",
  support: "#e8bf4f",
} as const;

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
    color: string = palette.text,
    max = 650,
    weight = 600,
  ) => {
    ctx.font = `${weight} ${size}px -apple-system, BlinkMacSystemFont, "Segoe UI", "Yu Gothic", sans-serif`;
    ctx.fillStyle = color;
    ctx.fillText(value, x, y, max);
  };
  const box = (
    x: number,
    y: number,
    w: number,
    h: number,
    fill: string | CanvasGradient,
    stroke: string = palette.border,
    radius = 18,
  ) => {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.5;
    ctx.stroke();
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

  ctx.fillStyle = palette.background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const glow = ctx.createRadialGradient(800, 0, 80, 800, 0, 980);
  glow.addColorStop(0, "rgba(72, 190, 211, 0.15)");
  glow.addColorStop(1, "rgba(7, 23, 31, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "rgba(105, 202, 217, 0.035)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= canvas.width; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y <= canvas.height; y += 64) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  text("UNITE DRAFT", 60, 76, 36, palette.text, 500, 750);
  text(
    draft.allStar
      ? `ALL-STAR · BO${draft.bestOf} · GAME ${String(draft.game).padStart(2, "0")}`
      : "DRAFT RESULT",
    60,
    117,
    20,
    palette.cyan,
    600,
    700,
  );
  text("3 BAN / 5 PICK", 1250, 80, 24, palette.secondary, 300, 700);
  ctx.fillStyle = palette.cyan;
  ctx.fillRect(60, 137, 1480, 2);

  for (const [index, team] of (["purple", "orange"] as const).entries()) {
    const x = 60 + index * 760;
    const color = team === "purple" ? palette.purple : palette.orange;
    const teamFill = ctx.createLinearGradient(x, 154, x, 1088);
    teamFill.addColorStop(0, palette.surface);
    teamFill.addColorStop(0.68, palette.surface);
    teamFill.addColorStop(1, `${color}3d`);
    box(x, 154, 720, 934, teamFill, `${color}b8`, 24);
    const headerFill = ctx.createLinearGradient(x + 22, 0, x + 698, 0);
    headerFill.addColorStop(0, `${color}52`);
    headerFill.addColorStop(1, palette.raised);
    box(x + 22, 176, 676, 74, headerFill, `${color}b5`, 16);
    text(names[team], x + 42, 223, 29, palette.text, 535, 750);
    text(
      draft.first === team ? "先攻" : "後攻",
      x + 604,
      221,
      20,
      color,
      80,
      750,
    );
    text("BAN · 使用禁止", x + 30, 291, 18, palette.secondary, 240, 700);
    draft.actions
      .filter((a) => a.team === team && a.phase === "ban")
      .forEach((a, i) => {
        const bx = x + 26 + i * 226;
        box(bx, 309, 216, 142, palette.raised, `${color}75`, 16);
        if (a.pokemon) portrait(a.pokemon, bx + 64, 310, 90);
        text(
          a.pokemon ? byId.get(a.pokemon)!.name : "—",
          bx + 12,
          432,
          18,
          a.pokemon ? palette.secondary : palette.muted,
          192,
          650,
        );
      });
    text("PICK · 選出ポケモン", x + 30, 496, 18, palette.secondary, 260, 700);
    draft.actions
      .filter((a) => a.team === team && a.phase === "pick")
      .forEach((a, i) => {
        const y = 516 + i * 109;
        const p = byId.get(a.pokemon!)!;
        const roleColor = palette[p.role];
        const cardFill = ctx.createLinearGradient(x + 26, y, x + 694, y);
        cardFill.addColorStop(0, `${color}32`);
        cardFill.addColorStop(0.48, palette.raised);
        cardFill.addColorStop(1, "#11262f");
        box(x + 26, y, 668, 98, cardFill, `${color}90`, 16);
        ctx.fillStyle = roleColor;
        ctx.fillRect(x + 26, y + 18, 4, 62);
        text(
          String(i + 1).padStart(2, "0"),
          x + 40,
          y + 58,
          18,
          palette.muted,
          36,
          700,
        );
        portrait(p.id, x + 82, y + 1, 96);
        text(p.name, x + 201, y + 30, 23, palette.text, 465, 750);
        text(`${roles[p.role]}型`, x + 202, y + 56, 16, roleColor, 465, 700);
        text(
          names.trainers?.[team === "purple" ? i : i + 5] ??
            `Trainer ${team === "purple" ? i + 1 : i + 6}`,
          x + 202,
          y + 82,
          15,
          palette.secondary,
          465,
          550,
        );
      });
  }
  text(
    "非公式ファンメイドツール · Pokémon UNITE",
    60,
    1132,
    17,
    palette.secondary,
  );
  text(
    "© Pokémon / Nintendo / Creatures / GAME FREAK / TiMi",
    60,
    1159,
    14,
    palette.muted,
  );
  return canvas.toDataURL("image/png");
}
