/**
 * One loader for a portal's shared data, with two ways to ask for it:
 *
 *  - `shared()` for polls and screens that just opened: if a load is already running, wait for that one.
 *  - `fresh()` after the user changed something: the data must come from a load that STARTED after the
 *    call, because a load already running began before the change was saved.
 *
 * Before this, both portals had only the shared kind. Saving a new lead and then refreshing could hand
 * back a poll that had started a moment earlier, without the new lead, so the lead page said "This lead
 * is not in your queue" until the next poll (reported in acceptance testing, Journey 4).
 * Several `fresh()` calls made while a load runs still share ONE follow-up load.
 */
export function createFreshLoader(load: () => Promise<void>) {
  let running: Promise<void> | null = null;
  let queued: Promise<void> | null = null;

  const start = (): Promise<void> => {
    running = load().finally(() => {
      running = null;
    });
    return running;
  };

  function shared(): Promise<void> {
    return running || start();
  }

  function fresh(): Promise<void> {
    if (!running) return start();
    if (!queued) {
      queued = running
        .catch(() => {})
        .then(() => {
          queued = null;
          return running || start();
        });
    }
    return queued;
  }

  return { shared, fresh, isRunning: () => running !== null };
}
