import { LayoutTemplate } from "lucide-react";
import SectionItem from "@/components/SectionItem";
import Spinner from "@/components/Spinner";
import { useTranslation } from "@/hooks/useTranslation";
import {
  installableVersion,
  useAgentTemplates,
  useInstallAgentTemplate,
} from "@/queries/useAgentTemplates";

/**
 * T7 — the catalogue, as a shop owner sees it.
 *
 * What is NOT here is the point of the item: no model, no protocol, no URL, no
 * temperature. A template carries all of that, and an agent installed from one
 * is a pointer at a published version (T6), so the only decision on this
 * screen is which job the agent has.
 *
 * A template whose every version was retired is not offered. Installing it
 * would raise, and an error message is a worse answer than not being on the
 * list: retiring a version is how the platform stops handing something out.
 */
export default function TemplateGallery({
  onInstalled,
}: {
  onInstalled: (agentId: string) => void;
}) {
  const { translate: t } = useTranslation();
  const { data: templates, isPending } = useAgentTemplates();
  const install = useInstallAgentTemplate();

  if (isPending) return <Spinner />;

  const installable = (templates ?? [])
    .map((template) => ({ template, version: installableVersion(template) }))
    .filter((entry) => entry.version !== undefined);

  if (installable.length === 0) {
    return (
      <p className="text-sm opacity-70">
        {t(
          "Todavía no hay plantillas disponibles. Podés crear el agente en blanco.",
        )}
      </p>
    );
  }

  return (
    <>
      {installable.map(({ template, version }) => (
        <SectionItem
          key={template.id}
          title={template.name}
          description={
            <div className="flex flex-col">
              <span>{template.description}</span>
              <span className="text-muted-foreground text-[13px]">
                {[template.category, `v${version!.version}`]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </div>
          }
          aside={
            <div className="bg-primary/10 rounded-full p-[8px]">
              <LayoutTemplate className="text-primary h-[24px] w-[24px]" />
            </div>
          }
          disabled={install.isPending}
          onClick={() =>
            install.mutate(
              { templateId: template.id, version: version!.version },
              { onSuccess: (agent) => onInstalled(agent!.id) },
            )
          }
        />
      ))}

      <p className="text-sm opacity-70">
        {t(
          "El agente se crea en borrador: podés leerlo y ajustarlo antes de que conteste.",
        )}
      </p>
    </>
  );
}
