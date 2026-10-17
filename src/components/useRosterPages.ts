import { useLayoutEffect, useRef, useState } from "react";

/** Fit whole cards into the actual workspace, including text-size changes. */
export default function useRosterPages(active: boolean, view: string) {
  const ref = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState({ columns: 3, rows: 1, size: 3 });
  useLayoutEffect(() => {
    const grid = ref.current;
    if (!grid || !active) return;
    const measure = () => {
      if (!grid.clientWidth || !grid.clientHeight) return;
      const css = getComputedStyle(grid);
      const font = parseFloat(
        getComputedStyle(document.documentElement).fontSize,
      );
      const gap = parseFloat(css.columnGap) || 6;
      const width = grid.clientWidth - 8;
      const height = grid.clientHeight - 8;
      const compact = window.matchMedia(
        "(max-width: 1000px) and (orientation: landscape)",
      ).matches;
      const columns = Math.max(
        1,
        Math.floor(
          (width + gap) /
            (Math.max(compact ? 44 : 56, (compact ? 2.75 : 3.5) * font) + gap),
        ),
      );
      const rows = Math.max(
        1,
        Math.floor(
          (height + gap) /
            (Math.max(compact ? 44 : 56, (compact ? 2.75 : 3.5) * font) + gap),
        ),
      );
      const size = columns * rows;
      setLayout((before) =>
        before.columns === columns && before.rows === rows
          ? before
          : { columns, rows, size },
      );
    };
    const observer = new ResizeObserver(measure);
    observer.observe(grid);
    observer.observe(document.documentElement);
    measure();
    return () => observer.disconnect();
  }, [active, view]);
  return { ref, ...layout };
}
