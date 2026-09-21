// Existing saved nonzero durations are treated as timer enabled.
export function turnSeconds(enabled: boolean, phase: "ban" | "pick") {
  return enabled ? (phase === "ban" ? 15 : 20) : 0;
}
