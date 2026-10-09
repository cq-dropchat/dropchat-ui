/** Scoped signals shared by initial loading and all Realtime channels. */
export type RecoverySignal = {
  organizationId: string;
  userId: string | undefined;
  state: "disconnected" | "reconnected";
};
const listeners = new Set<(signal: RecoverySignal) => void>();
export function onRecoverySignal(listener: (signal: RecoverySignal) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function subscriptionObserver(
  organizationId: string,
  userId: string | undefined,
) {
  let subscribed = false;
  let interrupted = false;
  return (status: string) => {
    if (status === "SUBSCRIBED") {
      if (interrupted)
        for (const listener of listeners)
          listener({ organizationId, userId, state: "reconnected" });
      subscribed = true;
      interrupted = false;
    } else if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) {
      if (subscribed || !interrupted)
        for (const listener of listeners)
          listener({ organizationId, userId, state: "disconnected" });
      interrupted = true;
    }
  };
}
