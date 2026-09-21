// T7. The template panel, in the app's own layout.
//
// It began as a page of its own — a bare div with the whole catalogue stacked
// in it — which is why it is here now: under `_auth`, so it gets the icon
// sidebar, this list in the left panel and the open template in the center,
// exactly like conversations, agents and stats. A screen that looks like the
// rest of the app is read like the rest of the app.
//
// What did NOT change is who it is for. It crosses organizations, so its entry
// in the sidebar only exists for a platform admin, RLS is what actually guards
// it, and the check below only decides what to draw.
import {
  createFileRoute,
  Outlet,
  useLocation,
  useNavigate,
} from "@tanstack/react-router";
import { LayoutTemplate, Plus } from "lucide-react";
import SectionBody from "@/components/SectionBody";
import SectionHeader from "@/components/SectionHeader";
import SectionItem from "@/components/SectionItem";
import Spinner from "@/components/Spinner";
import Badge from "@/components/ui/Badge";
import Skeleton from "@/components/ui/Skeleton";
import { useTranslation } from "@/hooks/useTranslation";
import { useAgentTemplates } from "@/queries/useAgentTemplates";
import { catalogueVersion } from "@/components/templates/catalogue";
import { useIsPlatformAdmin } from "@/queries/useErrorIssues";

export const Route = createFileRoute("/_auth/templates")({
  component: TemplateList,
});

function TemplateList() {
  const { translate: t } = useTranslation();
  const navigate = useNavigate();
  const pathname = useLocation().pathname;
  const { data: isAdmin, isPending } = useIsPlatformAdmin();
  const { data: templates, isPending: loadingTemplates } = useAgentTemplates();

  if (isPending) return <Spinner />;

  if (!isAdmin) {
    return (
      <>
        <SectionHeader title={t("Plantillas")} />
        <SectionBody>
          <p className="text-sm">{t("No tenés acceso a este panel.")}</p>
        </SectionBody>
      </>
    );
  }

  return (
    <>
      <SectionHeader title={t("Plantillas")} />

      <SectionBody>
        <SectionItem
          title={t("Nueva plantilla")}
          aside={
            <div className="bg-primary/10 rounded-full p-[8px]">
              <Plus className="text-primary h-[24px] w-[24px]" />
            </div>
          }
          className={pathname === "/templates/new" ? "bg-accent" : ""}
          onClick={() =>
            navigate({ to: "/templates/new", hash: (prev) => prev! })
          }
        />

        {/* A list on its way and a list with nothing in it used to look the
            same: empty. */}
        {loadingTemplates &&
          [0, 1, 2].map((row) => (
            <SectionItem
              key={row}
              aside={
                <Skeleton width={40} height={40} className="rounded-full" />
              }
              title={<Skeleton width={170} />}
              description={<Skeleton width={110} height={12} />}
            />
          ))}

        {templates?.length === 0 && (
          <p className="text-sm opacity-70">
            {t(
              "Todavía no hay plantillas. La primera se crea desde acá; la organización de origen está en el runbook.",
            )}
          </p>
        )}

        {templates?.map((template) => {
          const open = pathname === `/templates/${template.id}`;
          const version = catalogueVersion(template.agent_template_versions);
          const staged = template.agent_template_versions.some(
            (one) => !one.retired_at && one.canary_organizations?.length,
          );

          return (
            <SectionItem
              key={template.id}
              title={template.name}
              description={
                // The state of the entry as a chip, not as one more fragment
                // of a sentence made of dots: what matters about a template
                // is whether anybody can install it.
                <span className="flex min-w-0 items-center gap-[8px]">
                  <span className="truncate font-mono text-[12px]">
                    {template.slug}
                  </span>
                  {template.archived_at ? (
                    <Badge tone="kraft">{t("Archivada")}</Badge>
                  ) : version ? (
                    <Badge tone="primary">v{version.version}</Badge>
                  ) : staged ? (
                    <Badge tone="warning">{t("En prueba")}</Badge>
                  ) : (
                    <Badge tone="neutral">{t("Sin publicar")}</Badge>
                  )}
                </span>
              }
              aside={
                <div
                  className={`rounded-full p-[8px] ${open ? "bg-primary/10" : ""}`}
                >
                  <LayoutTemplate
                    className={`h-[24px] w-[24px] ${
                      open ? "text-primary" : "text-muted-foreground"
                    }`}
                  />
                </div>
              }
              className={open ? "bg-accent" : ""}
              onClick={() =>
                navigate({
                  to: `/templates/${template.id}`,
                  hash: (prev) => prev!,
                })
              }
            />
          );
        })}
      </SectionBody>

      <Outlet />
    </>
  );
}
