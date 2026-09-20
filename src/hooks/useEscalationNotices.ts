import { useEffect, useMemo, useRef } from "react";
import useBoundStore from "@/stores/useBoundStore";
import { useCurrentAgent } from "@/queries/useAgents";
import { useTranslation } from "@/hooks/useTranslation";

/**
 * H5 — telling somebody that a conversation is waiting for a person.
 *
 * The fact itself arrives on its own: H3 sets `awaiting_human_since` and the
 * conversation row travels by Realtime like any other change, so the list can
 * show it. What this adds is everything that works when nobody is looking at
 * the list — which is most of the time:
 *
 *   the tab's title   a count, so a background tab says how many are waiting
 *   a notification    one per handover, for the tab that is not on screen
 *
 * Deliberately NOT notified: the conversation already open, because the
 * person is looking at it. And nothing is ever shown for a conversation the
 * viewer cannot see — the store only holds rows RLS already let through.
 *
 * Permission is asked at the first handover, never on load: a page that asks
 * for notifications before it has anything to say gets denied, and the
 * decision is permanent.
 */
export function useEscalationNotices() {
  const { translate } = useTranslation();
  // Kept in a ref: `translate` is a new closure on every render, and this
  // effect must run when a conversation starts waiting, not when React
  // re-renders.
  const translateRef = useRef(translate);

  translateRef.current = translate;
  const conversations = useBoundStore((state) => state.chat.conversations);
  const activeConvId = useBoundStore((state) => state.ui.activeConvId);
  const { data: agent } = useCurrentAgent();

  const wanted = agent?.extra?.notifications?.escalation !== false;

  const waiting = useMemo(
    () =>
      [...conversations.values()].filter((conv) => !!conv.awaiting_human_since),
    [conversations],
  );

  // Which ones have already been announced. A conversation that is taken and
  // escalated again is a new handover, so ids leave this set when their wait
  // ends rather than staying for the session.
  const announced = useRef(new Set<string>());
  const asked = useRef(false);
  // What is waiting to be shown while the permission prompt is open. The
  // push that triggers a handover also re-renders this hook, so an effect
  // that cancelled itself on re-run would drop exactly the notification it
  // was asking permission for.
  const queue = useRef<typeof waiting>([]);

  useEffect(() => {
    const waitingIds = new Set(waiting.map((conv) => conv.id));

    // A conversation that was taken and escalated again is a new handover,
    // so ids leave this set when their wait ends.
    for (const id of announced.current) {
      if (!waitingIds.has(id)) announced.current.delete(id);
    }

    const fresh = waiting.filter(
      (conv) => !announced.current.has(conv.id) && conv.id !== activeConvId,
    );

    for (const conv of fresh) announced.current.add(conv.id);

    if (!wanted || fresh.length === 0 || typeof Notification === "undefined") {
      return;
    }

    queue.current.push(...fresh);

    const flush = () => {
      const pending = queue.current;

      queue.current = [];

      if (Notification.permission !== "granted") return;

      for (const conv of pending) {
        new Notification(conv.name ?? conv.address, {
          body: translateRef.current("Espera a una persona del equipo"),
          // One notification per conversation, replaced rather than
          // stacked if it somehow fires twice.
          tag: `escalation:${conv.id}`,
        });
      }
    };

    if (Notification.permission === "granted") {
      flush();
    } else if (Notification.permission === "default" && !asked.current) {
      // Asked at the first handover and never on load: a page that asks
      // before it has anything to say gets denied, and that is permanent.
      asked.current = true;
      Notification.requestPermission().then(flush);
    } else {
      // Denied, or already asked and not granted: nothing to keep.
      queue.current = [];
    }
  }, [waiting, activeConvId, wanted]);

  // The count belongs to everyone, preference or not: turning notifications
  // off means "do not interrupt me", not "hide the queue".
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\)\s*/, "");

    document.title = waiting.length > 0 ? `(${waiting.length}) ${base}` : base;
  }, [waiting.length]);

  return { waiting, waitingCount: waiting.length };
}
