import type { MessageRow } from "@/supabase/client";
import { assignmentLine } from "./AssignmentNote";

/**
 * A `data` part as one line of prose, for the conversation list.
 *
 * The list used to print `JSON.stringify(content.data)` here, which is how a
 * conversation whose last row was an assignment note showed up as
 * `{"by":"7bee93c5-…","cause":"manual",…}` — the stored shape, leaking into
 * the one screen every operator reads first. Every kind the API can write now
 * names itself instead, the way the bubbles already did (Message.tsx renders
 * `content.text` when there is one, AssignmentNote.tsx renders the note as a
 * sentence).
 *
 * The order matters: `text` first, because a data part that carries rendered
 * text (a sent template carries its rendered body) has already said what it
 * is, and nothing here beats it.
 *
 * `media_placeholder` is not handled here — the list gives it a media icon
 * and its own label, alongside the file kinds it belongs with.
 *
 * `agentName` resolves a member id for the assignment note; the caller holds
 * the roster.
 */
export function dataPreview(
  message: MessageRow,
  t: (key: string) => string,
  agentName: (id: string | null) => string | undefined,
): string {
  const content = message.content;

  if (content.type !== "data") return "";

  if (content.text) return content.text;

  switch (content.kind) {
    case "assignment":
      return assignmentLine(content.data, t, agentName);

    case "location": {
      const where = content.data?.name || content.data?.address;
      return where ? `${t("Ubicación")}: ${where}` : t("Ubicación");
    }

    case "contacts": {
      const contacts = content.data ?? [];
      if (contacts.length === 1) {
        const name = contacts[0]?.name?.formatted_name;
        return name ? `${t("Contacto")}: ${name}` : t("Contacto");
      }
      return `${contacts.length} ${t("contactos")}`;
    }

    case "order":
      // `order.text` is the buyer's note, which may well be empty.
      return content.data?.text || t("Pedido");

    case "interactive": {
      // What the contact picked: a button's or a list option's title.
      const interactive = content.data;
      const title =
        interactive?.type === "button_reply"
          ? interactive.button_reply?.title
          : interactive?.list_reply?.title;
      return title || t("Respuesta");
    }

    case "button":
      return content.data?.text || t("Respuesta");

    case "template":
      // A template sent from here carries its rendered body in `text` and
      // never reaches this line; one written by the API without it can still
      // say which template it was.
      return content.data?.name || t("Plantilla");

    case "reaction": {
      const reaction = content.data;
      if (reaction?.action === "removed") return t("Quitó una reacción");
      const emoji =
        reaction?.unicode || (reaction?.name ? `:${reaction.name}:` : "");
      return emoji ? `${t("Reaccionó")} ${emoji}` : t("Reaccionó");
    }

    case "share": {
      const share = content.data;
      const label = share?.type === "ig_post" ? t("Publicación") : t("Reel");
      return share?.title ? `${label}: ${share.title}` : label;
    }

    case "referral": {
      const title = content.data?.ads_context_data?.ad_title;
      return title
        ? `${t("Anuncio")}: ${title}`
        : t("Llegó desde un anuncio o enlace");
    }

    case "unsupported":
      return t("Mensaje no soportado");

    // A kind this bundle does not know: a row written by a newer API than the
    // browser is running. Saying so is still better than its JSON.
    default:
      return t("Mensaje no soportado");
  }
}
