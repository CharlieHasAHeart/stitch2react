const counters = new Map<string, number>();

export function createId(prefix: string): string {
  const next = (counters.get(prefix) ?? 0) + 1;
  counters.set(prefix, next);
  return `${prefix}_${next.toString().padStart(4, "0")}`;
}

export function resetIds(): void {
  counters.clear();
}
