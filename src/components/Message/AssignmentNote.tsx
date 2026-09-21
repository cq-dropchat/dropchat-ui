import { useTranslation } from "@/hooks/useTranslation";
import { useCurrentAgents } from "@/queries/useAgents";
import type { MessageRow } from "@/supabase/client";
import {
  ESCALATION_CATEGORIES,
  type AssignmentData,
  type EscalationCategory,
} from "@/supabase/types/message_types";

/**
 * H6 — an assignment note (H1), rendered as a line of the conversation's
 * record rather than as the JSON it is stored as.
 *
 * These rows are how a conversation says who is answering it and why. Read by
 * whoever opens the chat next — often the person who just took it over — so
 * they read as a sentence: "Sofía derivó a Equipo humano: reclamo — el pedido
 * llegó dañado".
 */
export type { AssignmentData };

/**
 * The escalation vocabulary of H3, which the agent-client enforces as a closed
 * enum. Naming each one here rather than translating `data.category` straight
 * is what puts them in the locale files at all: a key reached through a
 * variable is invisible to `scripts/sync-translations.mjs`, so it was reported
 * as unused in all four locales and would eventually have been deleted.
 *
 * Spelling them out is also what makes them driftable, so the map is typed
 * `Record<EscalationCategory, string>` against the API's own list: add a
 * category upstream, re-sync the types, and this screen stops compiling until
 * it names and translates the new one. The fallback below survives anyway —
 * a row written by a newer API than the bundle the browser is running.
 */
function category(value: string, t: (key: string) => string): string {
  const named: Record<EscalationCategory, string> = {
    reclamo: t("reclamo"),
    pedido_fuera_de_alcance: t("pedido_fuera_de_alcance"),
    pide_persona: t("pide_persona"),
    pago: t("pago"),
    envio: t("envio"),
    cambio_devolucion: t("cambio_devolucion"),
    otro: t("otro"),
  };

  // A category the database grew and this bundle has not: better the raw
  // word than nothing.
  return isEscalationCategory(value) ? named[value] : value;
}

function isEscalationCategory(value: string): value is EscalationCategory {
  return (ESCALATION_CATEGORIES as readonly string[]).includes(value);
}

export function isAssignmentNote(
  message: MessageRow,
): message is MessageRow & { content: { data: AssignmentData } } {
  return (
    message.content?.type === "data" && message.content?.kind === "assignment"
  );
}

/**
 * The note as one line of prose: the sentence, plus the escalation detail
 * when the row carries one.
 *
 * Pulled out of the component because the conversation list needs the same
 * line — H6's rule is that these rows read as the record rather than as the
 * JSON they are stored as, and the list preview was the one place left
 * showing the JSON. `name` is the caller's agent lookup: the list already
 * holds the roster, and this file should not decide how it is fetched.
 */
export function assignmentLine(
  data: AssignmentData,
  t: (key: string) => string,
  name: (id: string | null) => string | undefined,
): string {
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

  return detail ? `${sentence}: ${detail}` : sentence;
}

export default function AssignmentNote({ message }: { message: MessageRow }) {
  const { translate: t } = useTranslation();
  const { data: agents } = useCurrentAgents();

  if (!isAssignmentNote(message)) return null;

  const name = (id: string | null) =>
    (id && agents?.find((agent) => agent.id === id)?.name) || undefined;

  return (
    <div className="flex justify-center my-[8px]" data-testid="assignment-note">
      <div className="max-w-[80%] rounded-[8px] bg-accent px-[12px] py-[6px] text-[13px] text-muted-foreground text-center">
        {assignmentLine(message.content.data, t, name)}
      </div>
    </div>
  );
}
