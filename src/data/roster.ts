import data from "./pokemon.json";
export type Role = "attack" | "balance" | "defense" | "speed" | "support";
export type Pokemon = {
  id: string;
  name: string;
  role: Role;
  order: number;
  image: string;
  source: string;
  detail: string;
};
export const pokemon: Pokemon[] = (data as Pokemon[]).map((p) => ({
  ...p,
  image: import.meta.env.BASE_URL + p.image.replace(/^\//, ""),
}));
export const ids = pokemon.map((p) => p.id);
export const byId = new Map(pokemon.map((p) => [p.id, p]));
export const roles: Record<Role, string> = {
  attack: "アタック型",
  balance: "バランス型",
  defense: "ディフェンス型",
  speed: "スピード型",
  support: "サポート型",
};
export const normalize = (s: string) =>
  s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60))
    .replace(/\s/g, "");
