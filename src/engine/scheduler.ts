// Holds work until `wallclock + TV delay`, so lights land when the goal lands on your telly.

export interface Scheduled<T> {
  /** When to run, ms since epoch. */
  at: number;
  /** Tie-breaker so same-instant items keep their enqueue order. */
  seq: number;
  item: T;
}

export function schedule<T>(
  queue: readonly Scheduled<T>[],
  at: number,
  item: T,
): Scheduled<T>[] {
  const seq = queue.length ? Math.max(...queue.map((q) => q.seq)) + 1 : 0;
  return [...queue, { at, seq, item }].sort(
    (a, b) => a.at - b.at || a.seq - b.seq,
  );
}

/** Split the queue into what is due by `until` and what remains. */
export function takeDue<T>(
  queue: readonly Scheduled<T>[],
  until: number,
): { due: Scheduled<T>[]; rest: Scheduled<T>[] } {
  const due: Scheduled<T>[] = [];
  const rest: Scheduled<T>[] = [];
  for (const q of queue) (q.at <= until ? due : rest).push(q);
  return { due, rest };
}
