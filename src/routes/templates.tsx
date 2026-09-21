// T7. The publishing panel.
//
// Same shape as /errors (E1), and for the same reasons: this crosses
// organizations, so it is not under /settings and not in the menu. It is
// reached by typing the URL, RLS is what actually guards it, and the check
// below only decides what to draw.
//
// It is not a convenience. `publish_agent_template_version` records
// `auth.uid()` and refuses a caller who is not a platform admin, so it cannot
// be called from the SQL editor at all — before this screen, the runbook in
// backend/README.md could create the rows but not publish a single version.
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Archive, ArchiveRestore, Upload } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import Button from "@/components/Button";
import Spinner from "@/components/Spinner";
import { useIsPlatformAdmin } from "@/queries/useErrorIssues";
import {
  type TemplateWithVersions,
  useAgentTemplates,
  useArchiveAgentTemplate,
  useCreateAgentTemplate,
  usePlatformSettings,
  usePublishAgentTemplateVersion,
  useRetireAgentTemplateVersion,
  useTemplateSourceAgents,
} from "@/queries/useAgentTemplates";

export const Route = createFileRoute("/templates")({
  component: TemplatePanel,
});

function TemplatePanel() {
  const { translate: t } = useTranslation();
  const { data: isAdmin, isPending } = useIsPlatformAdmin();
  const { data: templates } = useAgentTemplates();
  const { data: settings } = usePlatformSettings();

  if (isPending) return <Spinner />;

  if (!isAdmin) {
    return (
      <div className="p-[20px]">
        <p>{t("No tenés acceso a este panel.")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[20px] overflow-auto p-[20px]">
      <h1 className="text-[20px]">{t("Plantillas de agente")}</h1>

      {!settings?.template_org_id ? (
        <p className="text-sm">
          {t(
            "Falta configurar la organización de plantillas. Está en el runbook de README.md.",
          )}
        </p>
      ) : (
        <NewTemplate organizationId={settings.template_org_id} />
      )}

      {(templates ?? []).map((template) => (
        <TemplateCard key={template.id} template={template} />
      ))}
    </div>
  );
}

/** Creating a catalogue entry, which is what the SQL runbook used to do. */
function NewTemplate({ organizationId }: { organizationId: string }) {
  const { translate: t } = useTranslation();
  const { data: agents } = useTemplateSourceAgents(organizationId);
  const create = useCreateAgentTemplate();

  const [form, setForm] = useState({
    name: "",
    slug: "",
    description: "",
    category: "",
    source_agent_id: "",
  });

  const source = form.source_agent_id || agents?.[0]?.id || "";

  return (
    <div className="border-border flex flex-col gap-[8px] rounded-xl border p-[12px]">
      <div className="label">{t("Nueva plantilla")}</div>

      <label>
        <div className="label">{t("Nombre")}</div>
        <input
          className="text"
          value={form.name}
          onChange={(event) => setForm({ ...form, name: event.target.value })}
        />
      </label>

      <label>
        <div className="label">{t("Identificador")}</div>
        <input
          className="text"
          placeholder="ventas-contra-entrega"
          value={form.slug}
          onChange={(event) => setForm({ ...form, slug: event.target.value })}
        />
      </label>

      <label>
        <div className="label">{t("Descripción")}</div>
        <input
          className="text"
          value={form.description}
          onChange={(event) =>
            setForm({ ...form, description: event.target.value })
          }
        />
      </label>

      <label>
        <div className="label">{t("Categoría")}</div>
        <input
          className="text"
          value={form.category}
          onChange={(event) =>
            setForm({ ...form, category: event.target.value })
          }
        />
      </label>

      <label>
        <div className="label">{t("Agente de origen")}</div>
        <select
          className="text"
          value={source}
          onChange={(event) =>
            setForm({ ...form, source_agent_id: event.target.value })
          }
        >
          {(agents ?? []).map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name}
            </option>
          ))}
        </select>
      </label>

      <div>
        <Button
          type="button"
          className="primary"
          loading={create.isPending}
          disabled={!form.name || !form.slug || !source}
          onClick={() =>
            create.mutate(
              { ...form, source_agent_id: source },
              {
                onSuccess: () =>
                  setForm({
                    name: "",
                    slug: "",
                    description: "",
                    category: "",
                    source_agent_id: "",
                  }),
              },
            )
          }
        >
          {t("Crear")}
        </Button>
      </div>

      {create.isError && (
        <p role="alert" className="text-sm text-red-600">
          {create.error.message}
        </p>
      )}
    </div>
  );
}

function TemplateCard({ template }: { template: TemplateWithVersions }) {
  const { translate: t } = useTranslation();
  const publish = usePublishAgentTemplateVersion();
  const retire = useRetireAgentTemplateVersion();
  const archive = useArchiveAgentTemplate();
  const [changelog, setChangelog] = useState("");

  const versions = [...template.agent_template_versions].sort(
    (a, b) => b.version - a.version,
  );

  return (
    <div className="border-border flex flex-col gap-[8px] rounded-xl border p-[12px]">
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <span>{template.name}</span>
          <span className="text-muted-foreground text-[13px]">
            {[template.slug, template.category].filter(Boolean).join(" · ")}
            {template.archived_at ? ` · ${t("Archivada")}` : ""}
          </span>
        </div>

        <Button
          type="button"
          loading={archive.isPending}
          onClick={() =>
            archive.mutate({
              id: template.id,
              archived: !template.archived_at,
            })
          }
        >
          {template.archived_at ? (
            <ArchiveRestore className="h-[16px] w-[16px]" />
          ) : (
            <Archive className="h-[16px] w-[16px]" />
          )}
          {template.archived_at ? t("Recuperar") : t("Archivar")}
        </Button>
      </div>

      <ul className="flex flex-col gap-[4px]">
        {versions.map((version) => (
          <li
            key={version.version}
            className="flex items-center justify-between text-sm"
          >
            <span>
              v{version.version}
              {version.changelog ? ` — ${version.changelog}` : ""}
              {version.retired_at ? ` · ${t("Retirada")}` : ""}
            </span>

            {!version.retired_at && (
              <Button
                type="button"
                loading={retire.isPending}
                onClick={() =>
                  retire.mutate({
                    templateId: template.id,
                    version: version.version,
                  })
                }
              >
                {t("Retirar")} v{version.version}
              </Button>
            )}
          </li>
        ))}
      </ul>

      {/* Retiring is not deleting, and the difference is the whole reason the
          versions table has a `retired_at` instead of a DELETE. */}
      <p className="text-sm opacity-70">
        {t(
          "Retirar una versión la saca del catálogo. Los agentes que ya la usan siguen funcionando y ven un aviso.",
        )}
      </p>

      <label>
        <div className="label">{t("Qué cambió")}</div>
        <input
          className="text"
          value={changelog}
          onChange={(event) => setChangelog(event.target.value)}
        />
      </label>

      <div>
        <Button
          type="button"
          className="primary"
          loading={publish.isPending}
          onClick={() =>
            publish.mutate(
              { templateId: template.id, changelog },
              { onSuccess: () => setChangelog("") },
            )
          }
        >
          <Upload className="h-[16px] w-[16px]" />
          {t("Publicar")}
        </Button>
      </div>

      {/* The guards live in the function (T4): no source agent, a source
          outside the template organization, nothing changed since the last
          version. Their messages are the useful part, so they are shown. */}
      {publish.isError && (
        <p role="alert" className="text-sm text-red-600">
          {publish.error.message}
        </p>
      )}
    </div>
  );
}
