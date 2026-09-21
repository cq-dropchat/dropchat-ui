import { useState } from "react";
import { useLocation } from "@tanstack/react-router";
import { Archive, ArchiveRestore, LayoutTemplate, Upload } from "lucide-react";
import Button from "@/components/Button";
import Spinner from "@/components/Spinner";
import { useTranslation } from "@/hooks/useTranslation";
import { useIsPlatformAdmin } from "@/queries/useErrorIssues";
import {
  type TemplateWithVersions,
  useAgentTemplates,
  useArchiveAgentTemplate,
  useCreateAgentTemplate,
  usePlatformSettings,
  usePromoteAgentTemplateVersion,
  usePublishAgentTemplateVersion,
  useRetireAgentTemplateVersion,
  useTemplateSourceAgents,
} from "@/queries/useAgentTemplates";

/**
 * T7 — the center panel of the template screen.
 *
 * The list on the left says which templates exist; everything you DO to one
 * happens here. Chosen by pathname, the way StatsCenter is: the router's
 * children under /templates render nothing in the left panel, and this decides
 * what fills the center.
 */
export default function TemplateCenter() {
  const pathname = useLocation({ select: (l) => l.pathname });
  const { data: isAdmin, isPending: askingWho } = useIsPlatformAdmin();
  const { data: templates, isPending } = useAgentTemplates();

  // The same check the list on the left makes, because the layout routes this
  // half by pathname ALONE: without it, a tenant who typed the URL got «no
  // tenés acceso» on the left and the publishing form on the right. Nothing
  // could be written — every call raises 42501 — but drawing it at all is D12
  // broken inside the panel D12 paid for.
  //
  // Nothing rather than a sentence: the sentence is already on the left, and
  // two of them beside each other say it twice.
  if (askingWho || !isAdmin) return null;

  if (pathname === "/templates/new") return <NewTemplate />;

  const id = pathname.startsWith("/templates/")
    ? pathname.slice("/templates/".length)
    : null;

  if (!id) return <Empty />;
  if (isPending) return <Spinner />;

  const template = templates?.find((row) => row.id === id);

  if (!template) return <Empty />;

  return <TemplateDetail template={template} />;
}

function Empty() {
  const { translate: t } = useTranslation();

  return (
    <div className="flex h-full flex-col items-center justify-center gap-[10px] opacity-70">
      <LayoutTemplate className="h-[32px] w-[32px]" />
      <p>{t("Elegí una plantilla para publicar o retirar una versión.")}</p>
    </div>
  );
}

/** The same header shape a conversation has: what is open, and what to do to it. */
function CenterHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      data-testid="template-header"
      className="header border-border bg-background z-30 items-center justify-between border-b shadow-md"
    >
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-[16px]">{title}</span>
        {subtitle && (
          <span className="text-muted-foreground truncate text-[13px]">
            {subtitle}
          </span>
        )}
      </div>
      <div className="flex shrink-0 gap-[8px]">{children}</div>
    </div>
  );
}

function TemplateDetail({ template }: { template: TemplateWithVersions }) {
  const { translate: t } = useTranslation();
  const publish = usePublishAgentTemplateVersion();
  const promote = usePromoteAgentTemplateVersion();
  const retire = useRetireAgentTemplateVersion();
  const archive = useArchiveAgentTemplate();
  const [changelog, setChangelog] = useState("");
  const [canary, setCanary] = useState("");

  const versions = [...template.agent_template_versions].sort(
    (a, b) => b.version - a.version,
  );

  return (
    <>
      <CenterHeader
        title={template.name}
        subtitle={[template.slug, template.category]
          .filter(Boolean)
          .join(" · ")}
      >
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
      </CenterHeader>

      <div className="flex flex-col gap-[20px] overflow-y-auto p-[20px]">
        {template.archived_at && (
          <p role="alert" className="text-sm">
            {t(
              "Esta plantilla está archivada: no se ofrece, y las versiones publicadas siguen donde estaban.",
            )}
          </p>
        )}

        <div className="flex flex-col gap-[8px]">
          <div className="label">{t("Versiones")}</div>

          <ul className="flex flex-col gap-[6px]">
            {versions.map((version) => (
              <li
                key={version.version}
                className="flex items-center justify-between gap-[8px] text-sm"
              >
                <span>
                  v{version.version}
                  {version.changelog ? ` — ${version.changelog}` : ""}
                  {version.retired_at ? ` · ${t("Retirada")}` : ""}
                  {version.canary_organizations?.length
                    ? ` · ${t("En prueba")} (${version.canary_organizations.length})`
                    : ""}
                </span>

                <span className="flex shrink-0 gap-[8px]">
                  {/* T5: promoting is what ends a staged publication — the
                      version stops being for two organizations and becomes
                      the one everybody installs. */}
                  {!version.retired_at &&
                    !!version.canary_organizations?.length && (
                      <Button
                        type="button"
                        className="primary"
                        loading={promote.isPending}
                        onClick={() =>
                          promote.mutate({
                            templateId: template.id,
                            version: version.version,
                          })
                        }
                      >
                        {t("Promover")} v{version.version}
                      </Button>
                    )}

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
                </span>
              </li>
            ))}

            {versions.length === 0 && (
              <li className="text-sm opacity-70">
                {t("Todavía no publicaste ninguna versión de esta plantilla.")}
              </li>
            )}
          </ul>

          {/* Retiring is not deleting, and the difference is the whole reason
              the versions table has a `retired_at` instead of a DELETE. */}
          <p className="text-sm opacity-70">
            {t(
              "Retirar una versión la saca del catálogo. Los agentes que ya la usan siguen funcionando y ven un aviso.",
            )}
          </p>
        </div>

        <div className="border-border flex flex-col gap-[8px] border-t pt-[20px]">
          <div className="label">{t("Publicar una versión")}</div>

          <label>
            <div className="label">{t("Qué cambió")}</div>
            <input
              className="text"
              value={changelog}
              onChange={(event) => setChangelog(event.target.value)}
            />
          </label>

          {/* T5: two or three organizations first, watched, and then
              everybody. Ids and not a picker on purpose — this panel crosses
              every tenant, so there is no list of organizations to offer that
              would not be one tenant's names shown to another. */}
          <label>
            <div className="label">
              {t("Publicar solo para (ids, separados por coma)")}
            </div>
            <input
              className="text"
              placeholder={t("Vacío: para todas")}
              value={canary}
              onChange={(event) => setCanary(event.target.value)}
            />
          </label>

          <div>
            <Button
              type="button"
              className="primary"
              loading={publish.isPending}
              onClick={() =>
                publish.mutate(
                  {
                    templateId: template.id,
                    changelog,
                    canary: canary
                      .split(",")
                      .map((id) => id.trim())
                      .filter(Boolean),
                  },
                  {
                    onSuccess: () => {
                      setChangelog("");
                      setCanary("");
                    },
                  },
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
      </div>
    </>
  );
}

/** Creating a catalogue entry, which is what the SQL runbook used to do. */
function NewTemplate() {
  const { translate: t } = useTranslation();
  const { data: settings, isPending } = usePlatformSettings();
  const { data: agents } = useTemplateSourceAgents(
    settings?.template_org_id ?? null,
  );
  const create = useCreateAgentTemplate();

  const [form, setForm] = useState({
    name: "",
    slug: "",
    description: "",
    category: "",
    source_agent_id: "",
  });

  const source = form.source_agent_id || agents?.[0]?.id || "";

  if (isPending) return <Spinner />;

  return (
    <>
      <CenterHeader title={t("Nueva plantilla")} />

      <div className="flex flex-col gap-[10px] overflow-y-auto p-[20px]">
        {!settings?.template_org_id ? (
          <p className="text-sm">
            {t(
              "Falta configurar la organización de plantillas. Está en el runbook de README.md.",
            )}
          </p>
        ) : (
          <>
            <label>
              <div className="label">{t("Nombre")}</div>
              <input
                className="text"
                value={form.name}
                onChange={(event) =>
                  setForm({ ...form, name: event.target.value })
                }
              />
            </label>

            <label>
              <div className="label">{t("Identificador")}</div>
              <input
                className="text"
                placeholder="ventas-contra-entrega"
                value={form.slug}
                onChange={(event) =>
                  setForm({ ...form, slug: event.target.value })
                }
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
          </>
        )}
      </div>
    </>
  );
}
