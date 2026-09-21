/**
 * What fills the center column of the app.
 *
 * Three screens want it — a conversation, the stats and the platform's
 * template panel (T7) — and the fourth answer is the action cards, which is
 * the empty state. It is a function and not two `startsWith` checks inline
 * because of the case that is easy to get wrong and invisible once it is:
 * WhatsApp MESSAGE templates live under
 * `/integrations/whatsapp/<address>/templates`, which ends the same way as the
 * agent template panel and is a different thing entirely.
 */
export type CenterPanel = "chat" | "stats" | "templates" | "actions";

export function centerPanel(
  pathname: string,
  activeConvId: string | null | undefined,
): CenterPanel {
  if (pathname.startsWith("/stats")) return "stats";
  if (pathname.startsWith("/templates")) return "templates";
  if (activeConvId) return "chat";

  return "actions";
}
