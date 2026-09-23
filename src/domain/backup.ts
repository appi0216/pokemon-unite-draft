import { restoreDraft, validNames } from "./draft";
import type { Draft, Names } from "./draft";

export type SavedSettings = Names & { seconds: number; sound: boolean };
export type TeamPreset = { name: string; team: string; trainers: string[] };
export const PRESETS_KEY = "unite-draft.presets.v1";
export function validPresets(value: unknown): value is TeamPreset[] {
  return (
    Array.isArray(value) &&
    value.length <= 30 &&
    value.every(
      (p) =>
        p &&
        typeof p.name === "string" &&
        p.name.length <= 100 &&
        typeof p.team === "string" &&
        p.team.length <= 100 &&
        Array.isArray(p.trainers) &&
        p.trainers.length === 5 &&
        p.trainers.every(
          (n: unknown) => typeof n === "string" && n.length <= 100,
        ),
    )
  );
}
export function readPresets(): TeamPreset[] {
  try {
    const value = JSON.parse(localStorage.getItem(PRESETS_KEY) || "[]");
    return validPresets(value) ? value : [];
  } catch {
    return [];
  }
}
export function parseBackup(
  text: string,
  ids: readonly string[],
): {
  draft: Draft;
  settings: SavedSettings;
  started: boolean;
  presets: TeamPreset[];
} {
  const v = JSON.parse(text);
  const draft = restoreDraft(v?.draft, ids);
  if (
    v?.format !== "unite-draft-backup" ||
    v.version !== 1 ||
    !draft ||
    !validNames(v.settings) ||
    ![0, 20, 30, 45, 60].includes(v.settings.seconds) ||
    typeof v.settings.sound !== "boolean" ||
    typeof v.started !== "boolean" ||
    !validPresets(v.presets)
  )
    throw new Error("Invalid backup");
  return {
    draft,
    settings: v.settings,
    started: v.started,
    presets: v.presets,
  };
}
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
