import Card from "@/components/ui/Card";
import { useTranslation } from "@/hooks/useTranslation";

/** Every header the agent adds to a call, for whoever is on the other end. */
const HEADERS = [
  "organization-id",
  "organization-address",
  "conversation-id",
  "agent-id",
  "contact-id",
  "contact-address",
];

/**
 * What the server on the other side receives, whoever wrote it.
 *
 * The same list was spelled out twice, in the MCP editor and in the HTTP one,
 * as a bare `<ul>` under everything else — the only block on either screen
 * that was neither a field nor an action, with nothing to say it was not one.
 */
export default function CallHeaders() {
  const { translate: t } = useTranslation();

  return (
    <Card title={t("Lo que enviamos en cada llamada")}>
      <p className="text-secondary-foreground text-[14px] leading-[1.5]">
        {t("Se envían los siguientes encabezados HTTP con cada solicitud:")}
      </p>

      <ul className="flex flex-wrap gap-[6px]">
        {HEADERS.map((header) => (
          <li key={header}>
            <code className="bg-secondary text-secondary-foreground rounded-[8px] px-[8px] py-[3px] font-mono text-[12px]">
              {header}
            </code>
          </li>
        ))}
      </ul>
    </Card>
  );
}
