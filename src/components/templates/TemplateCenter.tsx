import { useState } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import dayjs from "dayjs";
import "dayjs/locale/es";
import "dayjs/locale/pt";
import {
  Archive,
  ArchiveRestore,
  ArrowUp,
  Check,
  Clock,
  ExternalLink,
  Info,
  LayoutTemplate,
  Package,
  Pencil,
  Plus,
  RotateCcw,
  Upload,
  X,
} from "lucide-react";
import Button from "@/components/Button";
import Alert from "@/components/ui/Alert";
import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import ChipsInput from "@/components/ui/ChipsInput";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import Field from "@/components/ui/Field";
import SegmentedControl from "@/components/ui/SegmentedControl";
import Skeleton from "@/components/ui/Skeleton";
import { useTranslation } from "@/hooks/useTranslation";
import { fill } from "@/i18n/translations";
import { useIsPlatformAdmin } from "@/queries/useErrorIssues";
import {
  type AgentTemplateVersion,
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
import { toast } from "@/stores/useToasts";
import { catalogueVersion, publishFailure, slugify } from "./catalogue";

/** What a changelog and a description are allowed to be, in characters. */
const CHANGELOG_MAX = 140;
const DESCRIPTION_MAX = 160;

/**
 * T7 — the center panel of the template screen: the template that is open.
 *
 * The list on the left says which templates exist; everything you DO to one
 * happens here — publish a version, stage it for two organizations, promote
 * it, retire it, archive the template — the same way a conversation is chosen
 * on the left and read in the center.
 *
 * It is still the only thing that can publish: `publish_agent_template_version`
 * records `auth.uid()` and refuses a caller who is not a platform admin, so it
 * cannot be called from the SQL editor at all.
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
  if (isPending) return <LoadingDetail />;

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

/**
 * While the catalogue is on its way.
 *
 * It used to be a spinner in the middle of the panel, which says «something
 * is happening» and nothing about what. This says what is coming.
 */
function LoadingDetail() {
  const { translate: t } = useTranslation();

  return (
    <div
      role="status"
      aria-label={t("Cargando")}
      className="flex flex-col gap-[20px] p-[24px]"
    >
      <Card padded={false}>
        {[0, 1, 2].map((row) => (
          <div
            key={row}
            className="border-border flex items-center justify-between gap-[16px] border-t px-[20px] py-[14px] first:border-t-0"
          >
            <div className="flex flex-col gap-[8px]">
              <Skeleton width={140} />
              <Skeleton width={240} height={12} />
            </div>
            <Skeleton width={84} height={32} />
          </div>
        ))}
      </Card>
    </div>
  );
}

/** The same header shape a conversation has: what is open, and what to do to it. */
function CenterHeader({
  title,
  subtitle,
  badges,
  children,
}: {
  title: string;
  subtitle?: React.ReactNode;
  badges?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div
      data-testid="template-header"
      className="border-border bg-background z-30 flex shrink-0 items-center justify-between gap-[16px] border-b px-[24px] py-[16px]"
    >
      <div className="flex min-w-0 flex-col gap-[6px]">
        <h1 className="font-display truncate text-[20px] font-bold tracking-[-0.01em] [font-stretch:112%]">
          {title}
        </h1>
        {subtitle && (
          <div className="flex items-center gap-[8px]">{subtitle}</div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-[10px]">
        {badges}
        {children}
      </div>
    </div>
  );
}

/** The slug, in the voice the brandbook keeps for data. */
function Slug({ children }: { children: string }) {
  return (
    <span className="bg-secondary text-secondary-foreground rounded-[8px] px-[8px] py-[3px] font-mono text-[12px] font-medium">
      {children}
    </span>
  );
}

function TemplateDetail({ template }: { template: TemplateWithVersions }) {
  const { translate: t, currentLanguage } = useTranslation();
  const publish = usePublishAgentTemplateVersion();
  const promote = usePromoteAgentTemplateVersion();
  const retire = useRetireAgentTemplateVersion();
  const archive = useArchiveAgentTemplate();

  const { data: settings } = usePlatformSettings();
  const { data: sourceAgents } = useTemplateSourceAgents(
    settings?.template_org_id ?? null,
  );

  const [changelog, setChangelog] = useState("");
  const [audience, setAudience] = useState<"all" | "canary">("all");
  const [canary, setCanary] = useState<string[]>([]);

  // What the confirmation is about, or nothing when there is none open.
  const [confirming, setConfirming] = useState<
    { kind: "retire"; version: number } | { kind: "archive" } | null
  >(null);

  const versions = [...template.agent_template_versions].sort(
    (a, b) => b.version - a.version,
  );
  const catalogue = catalogueVersion(template.agent_template_versions);
  const nextVersion = versions.length ? versions[0].version + 1 : 1;
  const archived = !!template.archived_at;

  const source = sourceAgents?.find(
    (agent) => agent.id === template.source_agent_id,
  );

  const day = (iso: string) =>
    dayjs(iso).locale(currentLanguage).format("D MMM YYYY");

  const staged = audience === "canary";
  const missingCanary = staged && canary.length === 0;

  function onPublish() {
    publish.mutate(
      {
        templateId: template.id,
        changelog,
        canary: staged ? canary : [],
      },
      {
        onSuccess: () => {
          toast.success(
            fill(t("Publicaste la v{n}"), { n: nextVersion }),
            staged
              ? fill(
                  canary.length === 1
                    ? t("La ven {n} organización. Promovela cuando aguante.")
                    : t("La ven {n} organizaciones. Promovela cuando aguante."),
                  { n: canary.length },
                )
              : t("La puede instalar cualquier organización."),
          );
          setChangelog("");
          setCanary([]);
          setAudience("all");
        },
      },
    );
  }

  return (
    <>
      <CenterHeader
        title={template.name}
        subtitle={
          <>
            <Slug>{template.slug}</Slug>
            {template.category && (
              <span className="text-muted-foreground text-[13px]">
                {t("Categoría")}: {template.category}
              </span>
            )}
          </>
        }
        badges={
          archived ? (
            <Badge tone="kraft" icon={Archive}>
              {t("Archivada")}
            </Badge>
          ) : catalogue ? (
            <Badge tone="primary" icon={Check}>
              {fill(t("v{n} en catálogo"), { n: catalogue.version })}
            </Badge>
          ) : (
            <Badge tone="neutral">{t("Sin publicar")}</Badge>
          )
        }
      >
        <Button
          type="button"
          className="secondary"
          loading={archive.isPending}
          onClick={() =>
            archived
              ? archive.mutate(
                  { id: template.id, archived: false },
                  {
                    onSuccess: () =>
                      toast.success(t("Recuperaste la plantilla")),
                  },
                )
              : setConfirming({ kind: "archive" })
          }
        >
          {archived ? (
            <ArchiveRestore className="h-[16px] w-[16px]" />
          ) : (
            <Archive className="h-[16px] w-[16px]" />
          )}
          {archived ? t("Recuperar") : t("Archivar")}
        </Button>
      </CenterHeader>

      <div className="flex flex-col gap-[20px] overflow-y-auto p-[24px]">
        {archived && (
          <Alert
            tone="kraft"
            icon={Archive}
            title={fill(t("Archivada el {fecha}"), {
              fecha: day(template.archived_at!),
            })}
          >
            {t(
              "No se ofrece a nadie nuevo y no se puede publicar. Las versiones que ya instalaron siguen donde estaban.",
            )}
          </Alert>
        )}

        <Card
          title={t("Versiones")}
          padded={false}
          action={
            template.source_agent_id && (
              <a
                href={`/agents/${template.source_agent_id}`}
                className="text-primary flex items-center gap-[6px] text-[14px] font-semibold"
              >
                {t("Abrir el agente de origen")}
                <ExternalLink className="h-[14px] w-[14px]" aria-hidden />
              </a>
            )
          }
          footer={
            <>
              <Info
                className="text-muted-foreground mt-[1px] h-[16px] w-[16px] shrink-0"
                aria-hidden
              />
              <p className="text-secondary-foreground text-[13px] leading-[1.5]">
                {t(
                  "Retirar saca la versión del catálogo. Los agentes que ya la usan siguen funcionando y ven un aviso.",
                )}
              </p>
            </>
          }
        >
          {versions.map((version) => (
            <VersionRow
              key={version.version}
              version={version}
              inCatalogue={catalogue?.version === version.version}
              day={day}
              promoting={promote.isPending}
              onPromote={() =>
                promote.mutate(
                  { templateId: template.id, version: version.version },
                  {
                    onSuccess: () =>
                      toast.success(
                        fill(t("Promoviste la v{n}"), { n: version.version }),
                        t("La puede instalar cualquier organización."),
                      ),
                  },
                )
              }
              onRetire={() =>
                setConfirming({ kind: "retire", version: version.version })
              }
            />
          ))}

          {versions.length === 0 && (
            <div className="border-border flex flex-col items-start gap-[12px] border-t p-[20px]">
              <LayoutTemplate
                className="text-muted-foreground h-[26px] w-[26px]"
                aria-hidden
              />
              <div className="flex flex-col gap-[4px]">
                <span className="text-[15px] font-semibold">
                  {t("Nadie puede instalar esta plantilla")}
                </span>
                <span className="text-secondary-foreground text-[14px] leading-[1.5]">
                  {t(
                    "Existe en el catálogo, pero sin una versión publicada no aparece para las tiendas.",
                  )}
                </span>
              </div>
            </div>
          )}
        </Card>

        <Card title={fill(t("Publicar la versión {n}"), { n: nextVersion })}>
          <Alert tone="kraft" icon={Package}>
            {source
              ? fill(
                  t(
                    "Se publica la configuración actual de «{agente}», el agente de la organización de plantillas.",
                  ),
                  { agente: source.name },
                )
              : t(
                  "Se publica la configuración actual del agente de origen de esta plantilla.",
                )}
          </Alert>

          <Field
            label={t("Qué cambió")}
            hint={t(
              "Es lo que leen los equipos cuando les ofrecemos actualizar. Una línea, en presente.",
            )}
            count={{ value: changelog.length, max: CHANGELOG_MAX }}
          >
            {(field) => (
              <textarea
                {...field}
                className="text"
                rows={2}
                maxLength={CHANGELOG_MAX}
                value={changelog}
                onChange={(event) => setChangelog(event.target.value)}
              />
            )}
          </Field>

          {/* T5: two or three organizations first, watched, and then
              everybody. Ids and not a picker on purpose — this panel crosses
              every tenant, so there is no list of organizations to offer that
              would not be one tenant's names shown to another. */}
          <div className="flex flex-col gap-[8px]">
            <span className="label mb-0">
              {fill(t("Quién recibe la versión {n}"), { n: nextVersion })}
            </span>
            <SegmentedControl
              label={fill(t("Quién recibe la versión {n}"), {
                n: nextVersion,
              })}
              value={audience}
              className="self-start"
              onChange={setAudience}
              options={[
                { value: "all", label: t("Todas las organizaciones") },
                { value: "canary", label: t("Solo algunas, en prueba") },
              ]}
            />
          </div>

          {staged && (
            <Field
              label={t("Organizaciones de la prueba")}
              hint={t(
                "Solo esas la ven hasta que la promuevas. Los ids de organización están en el runbook.",
              )}
            >
              {(field) => (
                <ChipsInput
                  {...field}
                  value={canary}
                  onChange={setCanary}
                  placeholder={t("Pegá un id y Enter")}
                />
              )}
            </Field>
          )}

          {/* The guards live in the function (T4): no source agent, a source
              outside the template organization, nothing changed since the last
              version. Their messages are the useful part, so they are shown —
              in Spanish, with the original one click away. */}
          {publish.isError && <PublishError message={publish.error.message} />}

          <div className="border-border flex items-center justify-between gap-[16px] border-t pt-[16px]">
            <span className="hint">
              {catalogue
                ? fill(
                    t(
                      "La v{n} sigue siendo la del catálogo hasta que promuevas esta.",
                    ),
                    { n: catalogue.version },
                  )
                : t(
                    "Es la primera versión: con ella la plantilla existe para las tiendas.",
                  )}
            </span>

            <Button
              type="button"
              className="primary"
              loading={publish.isPending}
              disabled={archived || missingCanary}
              disabledReason={
                archived
                  ? t("Una plantilla archivada no publica.")
                  : missingCanary
                    ? t("Agregá al menos una organización de prueba.")
                    : undefined
              }
              onClick={onPublish}
            >
              <Upload className="h-[16px] w-[16px]" />
              {fill(
                staged
                  ? t("Publicar la v{n} en prueba")
                  : t("Publicar la v{n}"),
                { n: nextVersion },
              )}
            </Button>
          </div>
        </Card>
      </div>

      <ConfirmDialog
        open={confirming?.kind === "retire"}
        title={fill(t("¿Retirar la v{n}?"), {
          n: confirming?.kind === "retire" ? confirming.version : "",
        })}
        confirmLabel={fill(t("Retirar la v{n}"), {
          n: confirming?.kind === "retire" ? confirming.version : "",
        })}
        loading={retire.isPending}
        onCancel={() => setConfirming(null)}
        onConfirm={() => {
          if (confirming?.kind !== "retire") return;
          const version = confirming.version;
          retire.mutate(
            { templateId: template.id, version },
            {
              onSuccess: () => {
                setConfirming(null);
                toast.success(
                  fill(t("Retiraste la v{n}"), { n: version }),
                  t("Sale del catálogo. Nadie más la instala."),
                );
              },
            },
          );
        }}
      >
        {t(
          "Sale del catálogo y nadie más la instala. Los agentes que ya la tienen siguen funcionando y ven un aviso de que fue retirada.",
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={confirming?.kind === "archive"}
        title={t("¿Archivar la plantilla?")}
        confirmLabel={t("Archivar")}
        loading={archive.isPending}
        onCancel={() => setConfirming(null)}
        onConfirm={() =>
          archive.mutate(
            { id: template.id, archived: true },
            {
              onSuccess: () => {
                setConfirming(null);
                toast.success(t("Archivaste la plantilla"));
              },
            },
          )
        }
      >
        {t(
          "Deja de ofrecerse y no se puede publicar. Las versiones publicadas siguen donde estaban, y podés recuperarla cuando quieras.",
        )}
      </ConfirmDialog>
    </>
  );
}

/** A failed publish, said twice: once in Spanish, once as Postgres put it. */
function PublishError({ message }: { message: string }) {
  const { translate: t } = useTranslation();
  const failure = publishFailure(message, t);

  return (
    <Alert tone="destructive" title={failure.title} details={message}>
      {failure.body}
    </Alert>
  );
}

function VersionRow({
  version,
  inCatalogue,
  day,
  promoting,
  onPromote,
  onRetire,
}: {
  version: AgentTemplateVersion;
  inCatalogue: boolean;
  day: (iso: string) => string;
  promoting: boolean;
  onPromote: () => void;
  onRetire: () => void;
}) {
  const { translate: t } = useTranslation();
  const retired = !!version.retired_at;
  const canary = version.canary_organizations?.length ?? 0;

  return (
    <div
      className={`border-border flex items-start justify-between gap-[16px] border-t px-[20px] py-[14px] ${
        inCatalogue ? "bg-primary-veil/30" : ""
      }`}
    >
      <div className="flex min-w-0 grow flex-col gap-[5px]">
        <div className="flex items-center gap-[10px]">
          <span
            className={`font-mono text-[15px] font-semibold ${retired ? "text-muted-foreground" : ""}`}
          >
            v{version.version}
          </span>

          {retired ? (
            <Badge tone="neutral" icon={RotateCcw}>
              {t("Retirada")}
            </Badge>
          ) : canary ? (
            <Badge tone="warning" icon={Clock}>
              {fill(
                canary === 1
                  ? t("En prueba · {n} organización")
                  : t("En prueba · {n} organizaciones"),
                { n: canary },
              )}
            </Badge>
          ) : inCatalogue ? (
            <Badge tone="primary" icon={Check}>
              {t("En catálogo")}
            </Badge>
          ) : (
            <Badge tone="neutral">{t("Publicada")}</Badge>
          )}
        </div>

        {version.changelog && (
          <span
            className={`text-[14px] leading-[1.5] ${retired ? "text-muted-foreground" : "text-secondary-foreground"}`}
          >
            {version.changelog}
          </span>
        )}

        <span className="text-muted-foreground text-[13px]">
          {retired
            ? fill(t("Retirada el {fecha}"), {
                fecha: day(version.retired_at!),
              })
            : fill(t("Publicada el {fecha}"), {
                fecha: day(version.published_at),
              })}
        </span>
      </div>

      <div className="flex shrink-0 gap-[8px]">
        {/* T5: promoting is what ends a staged publication — the version
            stops being for two organizations and becomes the one everybody
            installs. */}
        {!retired && !!canary && (
          <Button
            type="button"
            className="primary"
            loading={promoting}
            onClick={onPromote}
          >
            <ArrowUp className="h-[16px] w-[16px]" />
            {fill(t("Promover v{n}"), { n: version.version })}
          </Button>
        )}

        {!retired && (
          <button type="button" className="secondary" onClick={onRetire}>
            {fill(t("Retirar v{n}"), { n: version.version })}
          </button>
        )}
      </div>
    </div>
  );
}

/** Creating a catalogue entry, which is what the SQL runbook used to do. */
function NewTemplate() {
  const { translate: t } = useTranslation();
  const navigate = useNavigate();
  const { data: settings, isPending } = usePlatformSettings();
  const { data: agents } = useTemplateSourceAgents(
    settings?.template_org_id ?? null,
  );
  const { data: templates } = useAgentTemplates();
  const create = useCreateAgentTemplate();

  const [form, setForm] = useState({
    name: "",
    slug: "",
    description: "",
    category: "",
    source_agent_id: "",
  });
  // The identifier follows the name until somebody decides otherwise: it is
  // the same word without the accents, and typing it twice is how «ventas
  // contra entrega» and «ventas-contra-entrga» end up in the same catalogue.
  const [slugTouched, setSlugTouched] = useState(false);

  const slug = slugTouched ? form.slug : slugify(form.name);
  const source = form.source_agent_id || agents?.[0]?.id || "";

  const categories = [
    ...new Set(
      (templates ?? [])
        .map((template) => template.category)
        .filter((category): category is string => !!category),
    ),
  ].sort();

  const missing = !form.name
    ? t("Falta el nombre.")
    : !slug
      ? t("Falta el identificador.")
      : !source
        ? t("Falta el agente de origen.")
        : undefined;

  if (isPending) return <LoadingDetail />;

  return (
    <>
      <CenterHeader title={t("Nueva plantilla")}>
        <button
          type="button"
          aria-label={t("Cerrar")}
          className="hover:bg-accent flex h-[44px] w-[44px] items-center justify-center rounded-full"
          onClick={() => navigate({ to: "/templates", hash: (prev) => prev! })}
        >
          <X className="h-[20px] w-[20px]" aria-hidden />
        </button>
      </CenterHeader>

      <div className="flex flex-col gap-[20px] overflow-y-auto p-[24px]">
        {!settings?.template_org_id ? (
          <Alert
            tone="warning"
            title={t("Falta configurar la organización de plantillas")}
          >
            {t("Está en el runbook de README.md.")}
          </Alert>
        ) : (
          <>
            <Card title={t("Qué ve la tienda")}>
              <Field
                label={t("Nombre")}
                hint={t("Es lo que ven los equipos en el catálogo de agentes.")}
              >
                {(field) => (
                  <input
                    {...field}
                    type="text"
                    className="text"
                    value={form.name}
                    onChange={(event) =>
                      setForm({ ...form, name: event.target.value })
                    }
                  />
                )}
              </Field>

              <Field
                label={t("Identificador")}
                hint={t(
                  "Se arma solo con el nombre. Va en la URL y en el runbook, y no cambia después de crear.",
                )}
              >
                {(field) => (
                  <div
                    className={`flex items-center gap-[10px] rounded-[12px] ${
                      slugTouched
                        ? ""
                        : "bg-secondary border-border h-[56px] border pr-[8px] pl-[14px]"
                    }`}
                  >
                    <input
                      {...field}
                      type="text"
                      className={
                        slugTouched
                          ? "text font-mono"
                          : "grow bg-transparent font-mono text-[15px] outline-none"
                      }
                      readOnly={!slugTouched}
                      value={slug}
                      onChange={(event) =>
                        setForm({ ...form, slug: slugify(event.target.value) })
                      }
                    />
                    {!slugTouched && (
                      <button
                        type="button"
                        className="secondary px-[14px] text-[14px]"
                        onClick={() => {
                          setForm({ ...form, slug });
                          setSlugTouched(true);
                        }}
                      >
                        <Pencil className="h-[14px] w-[14px]" aria-hidden />
                        {t("Editar")}
                      </button>
                    )}
                  </div>
                )}
              </Field>

              <Field
                label={t("Descripción")}
                hint={t("Una línea: qué hace este agente por la tienda.")}
                count={{
                  value: form.description.length,
                  max: DESCRIPTION_MAX,
                }}
              >
                {(field) => (
                  <textarea
                    {...field}
                    className="text"
                    rows={2}
                    maxLength={DESCRIPTION_MAX}
                    value={form.description}
                    onChange={(event) =>
                      setForm({ ...form, description: event.target.value })
                    }
                  />
                )}
              </Field>
            </Card>

            <Card title={t("De dónde sale")}>
              <Field
                label={t("Agente de origen")}
                hint={t(
                  "Solo agentes de la organización de plantillas. Al publicar se copia su configuración.",
                )}
              >
                {(field) => (
                  <select
                    {...field}
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
                )}
              </Field>

              <Field
                label={t("Categoría")}
                hint={t(
                  "Agrupa el catálogo. Usá una que ya exista antes de inventar otra.",
                )}
              >
                {(field) =>
                  categories.length ? (
                    <div className="flex flex-col gap-[8px]">
                      <div className="flex flex-wrap gap-[8px]">
                        {categories.map((category) => (
                          <button
                            key={category}
                            type="button"
                            aria-pressed={form.category === category}
                            onClick={() =>
                              setForm({
                                ...form,
                                category:
                                  form.category === category ? "" : category,
                              })
                            }
                            className={`min-h-[44px] rounded-full px-[16px] text-[14px] font-medium ${
                              form.category === category
                                ? "bg-primary-veil text-primary"
                                : "bg-secondary text-secondary-foreground hover:text-foreground"
                            }`}
                          >
                            {category}
                          </button>
                        ))}
                      </div>
                      <input
                        {...field}
                        type="text"
                        className="text"
                        placeholder={t("u otra")}
                        value={form.category}
                        onChange={(event) =>
                          setForm({ ...form, category: event.target.value })
                        }
                      />
                    </div>
                  ) : (
                    <input
                      {...field}
                      type="text"
                      className="text"
                      value={form.category}
                      onChange={(event) =>
                        setForm({ ...form, category: event.target.value })
                      }
                    />
                  )
                }
              </Field>
            </Card>

            {create.isError && (
              <Alert
                tone="destructive"
                title={t("No se pudo crear la plantilla")}
                details={create.error.message}
              >
                {t("Revisá que el identificador no esté usado por otra.")}
              </Alert>
            )}

            <div className="border-border bg-card flex items-center justify-between gap-[16px] rounded-[18px] border px-[20px] py-[14px]">
              <span className="hint">
                {missing ||
                  t(
                    "Se crea vacía: después publicás la v1 desde el agente de origen.",
                  )}
              </span>

              <div className="flex shrink-0 gap-[10px]">
                <button
                  type="button"
                  className="secondary"
                  onClick={() =>
                    navigate({ to: "/templates", hash: (prev) => prev! })
                  }
                >
                  {t("Cancelar")}
                </button>

                <Button
                  type="button"
                  className="primary"
                  loading={create.isPending}
                  disabled={!!missing}
                  // No `disabledReason` here on purpose: what is missing is
                  // already the sentence beside the button. Saying it twice
                  // is only twice for whoever reads with their ears.

                  onClick={() =>
                    create.mutate(
                      { ...form, slug, source_agent_id: source },
                      {
                        onSuccess: (created) => {
                          toast.success(
                            t("Creaste la plantilla"),
                            t("Todavía no tiene versiones: publicá la v1."),
                          );
                          const id = (created as { id?: string } | null)?.id;
                          if (id)
                            navigate({
                              to: `/templates/${id}`,
                              hash: (prev) => prev!,
                            });
                        },
                      },
                    )
                  }
                >
                  <Plus className="h-[16px] w-[16px]" />
                  {t("Crear plantilla")}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
