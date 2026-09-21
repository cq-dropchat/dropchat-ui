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
import { useTranslation } from "@/hooks/useTranslation";
import {
  installableVersion,
  useAgentTemplates,
} from "@/queries/useAgentTemplates";
import { useIsPlatformAdmin } from "@/queries/useErrorIssues";

export const Route = createFileRoute("/_auth/templates")({
  component: TemplateList,
});

function TemplateList() {
  const { translate: t } = useTranslation();
  const navigate = useNavigate();
  const pathname = useLocation().pathname;
  const { data: isAdmin, isPending } = useIsPlatformAdmin();
  const { data: templates } = useAgentTemplates();

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

        {templates?.length === 0 && (
          <p className="text-sm opacity-70">
            {t(
              "Todavía no hay plantillas. La primera se crea desde acá; la organización de origen está en el runbook.",
            )}
          </p>
        )}

        {templates?.map((template) => {
          const open = pathname === `/templates/${template.id}`;
          const version = installableVersion(template);

          return (
            <SectionItem
              key={template.id}
              title={template.name}
              description={
                <span className="text-[13px]">
                  {[
                    template.slug,
                    template.category,
                    version ? `v${version.version}` : t("Sin publicar"),
                    template.archived_at ? t("Archivada") : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
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
