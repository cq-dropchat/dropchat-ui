import { useTranslation } from "@/hooks/useTranslation";
import { isToolTrace, type ToolInfo } from "@/supabase/types/message_types";
import type { MessageRow } from "@/supabase/client";

/**
 * What the agent did, as a line of the conversation's record.
 *
 * These rows used to render as the JSON they are stored as, headed
 * `Uso: escalate_to_human`, inside the transcript. The audience is the
 * reason that was wrong: the admin of an organization is the shop owner who
 * created it, not a programmer, and a payload tells them nothing except that
 * something looks broken. The rows are still there and still queryable; what
 * changed is that the inbox reads like an inbox.
 *
 * Three rules, and the reasons matter more than the rules:
 *
 *   * a handover says nothing at all — the assignment note (H1/H6) right
 *     below already says who handed it over, in what category and why, in a
 *     sentence written for exactly this reader;
 *   * a result that went fine says nothing — one line per action, or every
 *     trace doubles and the transcript is a log again;
 *   * a result that failed does speak, because it explains why the agent's
 *     next answer is worse than usual. The error text stays out: it is for
 *     whoever reads the function logs.
 */
export default function ToolNote({ message }: { message: MessageRow }) {
  const { translate: t } = useTranslation();

  if (!isToolTrace(message)) return null;

  const tool = message.content.tool;
  const name = "name" in tool ? tool.name : undefined;

  // The one tool whose trace is pure duplication.
  if (name === "escalate_to_human") return null;

  const failed = tool.event === "result" && tool.is_error === true;

  if (tool.event === "result" && !failed) return null;

  const sentence = failed
    ? `${t("No pudo usar")} ${toolName(tool, t)}`
    : `${t("Usó")} ${toolName(tool, t)}`;

  return (
    <div className="flex justify-center my-[8px]" data-testid="tool-note">
      <div className="max-w-[80%] rounded-[8px] bg-accent px-[12px] py-[6px] text-[13px] text-muted-foreground text-center">
        {sentence}
      </div>
    </div>
  );
}

/**
 * The tool, in words.
 *
 * A connection the organization set up is named by its own label — it chose
 * «catalogo», so «catalogo» is what it recognises. The tools this project
 * ships, and the ones a provider runs on its side, get a translated name.
 * Anything else falls back to the name the tool came with: an MCP server
 * brings tools nobody here can enumerate, and an unfamiliar word still reads
 * better than a payload.
 */
function toolName(
  tool: NonNullable<ToolInfo["tool"]>,
  t: (key: string) => string,
): string {
  if ("label" in tool && tool.label) return tool.label;

  const named: Record<string, string> = {
    calculator: t("Calculadora"),
    google_search: t("Búsqueda web"),
    web_search_preview: t("Búsqueda web"),
    url_context: t("Lectura de una página"),
    file_search: t("Búsqueda en archivos"),
    image_generation: t("Generación de imágenes"),
    code_execution: t("Ejecución de código"),
    code_interpreter: t("Ejecución de código"),
  };

  const key = ("name" in tool && tool.name) || tool.type;

  return named[key] ?? key;
}
