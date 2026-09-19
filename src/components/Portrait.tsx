import type { CSSProperties } from "react";
import type { Pokemon } from "../data/roster";
import measurements from "../data/portrait-layout.json";

const layout = measurements as Record<
  string,
  { width: number; left: number; top: number }
>;
export default function Portrait({
  p,
  eager = false,
  className = "",
}: {
  p: Pokemon;
  eager?: boolean;
  className?: string;
}) {
  const box = layout[p.id] || { width: 84, left: 8, top: 8 };
  return (
    <span
      className={`portrait ${className}`}
      style={
        {
          "--portrait-width": `${box.width}%`,
          "--portrait-left": `${box.left}%`,
          "--portrait-top": `${box.top}%`,
        } as CSSProperties
      }
    >
      <img
        src={p.image}
        alt={p.name}
        width="208"
        height="208"
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        draggable={false}
      />
    </span>
  );
}
