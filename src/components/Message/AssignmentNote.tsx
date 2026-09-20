import { useTranslation } from "@/hooks/useTranslation";
import { useCurrentAgents } from "@/queries/useAgents";
import type { MessageRow } from "@/supabase/client";

/**
 * H6 — an assignment note (H1), rendered as a line of the conversation's
 * record rather than as the JSON it is stored as.
 *
 * These rows are how a conversation says who is answering it and why. Read by
 * whoever opens the chat next — often the person who just took it over — so
 * they read as a sentence: "Sofía derivó a Equipo humano: reclamo — el pedido
 * llegó dañado".
 */
export type AssignmentData = {
  from: string | null;
  to: string | null;
  awaiting_human: boolean;
  by: string | null;
  cause: "routing" | "entry" | "escalation" | "manual" | "takeover" | "expiry";
  category?: string;
  reason?: string;
};

/**
 * The escalation vocabulary of H3, which the agent-client enforces as a closed
 * enum. Naming each one here rather than translating `data.category` straight
 * is what puts them in the locale files at all: a key reached through a
 * variable is invisible to `scripts/sync-translations.mjs`, so it was reported
 * as unused in all four locales and would eventually have been deleted.
 */
function category(value: string, t: (key: string) => string): string {
  const named: Record<string, string> = {
    reclamo: t("reclamo"),
    pedido_fuera_de_alcance: t("pedido_fuera_de_alcance"),
    pide_persona: t("pide_persona"),
    pago: t("pago"),
    envio: t("envio"),
    cambio_devolucion: t("cambio_devolucion"),
    otro: t("otro"),
  };

  // A category the database grew and this screen has not: better the raw
  // word than nothing.
  return named[value] ?? value;
}

export function isAssignmentNote(
  message: MessageRow,
): message is MessageRow & { content: { data: AssignmentData } } {
  return (
    message.content?.type === "data" && message.content?.kind === "assignment"
  );
}

export default function AssignmentNote({ message }: { message: MessageRow }) {
  const { translate: t } = useTranslation();
  const { data: agents } = useCurrentAgents();

  if (!isAssignmentNote(message)) return null;

  const data = message.content.data;

  const name = (id: string | null) =>
    (id && agents?.find((agent) => agent.id === id)?.name) || undefined;

  const actor = name(data.by);
  const target = data.awaiting_human
    ? t("Equipo humano")
    : (name(data.to) ?? t("la IA"));

  // Who did it is not always somebody: an expiry is the clock, and the first
  // routing of a conversation is the system.
  const sentence = (() => {
    switch (data.cause) {
      case "escalation":
        return actor
          ? `${actor} ${t("derivó a")} ${t("Equipo humano")}`
          : t("Derivada al equipo humano");
      case "takeover":
        return actor
          ? `${actor} ${t("tomó la conversación")}`
          : t("Tomada por una persona");
      case "expiry":
        return data.to
          ? `${t("Reasignada por vencimiento a")} ${target}`
          : t("Liberada por vencimiento");
      case "manual":
        return actor
          ? `${actor} ${t("asignó la conversación a")} ${target}`
          : `${t("Asignada a")} ${target}`;
      case "entry":
      case "routing":
      default:
        return `${t("Asignada a")} ${target}`;
    }
  })();

  const detail = [data.category && category(data.category, t), data.reason]
    .filter(Boolean)
    .join(" — ");

  return (
    <div className="flex justify-center my-[8px]" data-testid="assignment-note">
      <div className="max-w-[80%] rounded-[8px] bg-accent px-[12px] py-[6px] text-[13px] text-muted-foreground text-center">
        {sentence}
        {detail && `: ${detail}`}
      </div>
    </div>
  );
}
