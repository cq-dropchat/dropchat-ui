import SectionBody from "@/components/SectionBody";
import SectionHeader from "@/components/SectionHeader";
import { useTranslation } from "@/hooks/useTranslation";
import { useCurrentAgents, useCurrentAgent } from "@/queries/useAgents";
import { useCurrentOrganization } from "@/queries/useOrganizations";
import SectionItem from "@/components/SectionItem";
import Badge, { type Tone } from "@/components/ui/Badge";
import {
  createFileRoute,
  useLocation,
  useNavigate,
} from "@tanstack/react-router";
import { ArrowDownToLine, Plus } from "lucide-react";
import Avatar from "@/components/Avatar";

export const Route = createFileRoute("/_auth/agents/")({
  component: ListAgents,
});

function ListAgents() {
  const { translate: t } = useTranslation();
  const navigate = useNavigate();
  const { data: agents } = useCurrentAgents();
  const { data: currentAgent } = useCurrentAgent();
  const isAdmin = ["admin", "owner"].includes(currentAgent?.role || "");

  const { data: organization } = useCurrentOrganization();
  const pathname = useLocation().pathname;

  // H6: `draft` was missing here, so an agent that does not answer showed no
  // state at all — indistinguishable from an active one at a glance. It is a
  // chip and not a word in grey, the same one the agent's own screen shows.
  const state = (mode: string): { tone: Tone; label: string } => {
    switch (mode) {
      case "draft":
        return { tone: "neutral", label: t("Borrador") };
      case "inactive":
        return { tone: "neutral", label: t("Inactivo") };
      default:
        return { tone: "primary", label: t("Activo") };
    }
  };

  return (
    <>
      <SectionHeader title={t("Agentes")} />

      <SectionBody>
        <SectionItem
          title={t("Agregar agente")}
          aside={
            <div className="p-[8px] bg-primary/10 rounded-full">
              <Plus className="w-[24px] h-[24px] text-primary" />
            </div>
          }
          onClick={() =>
            navigate({
              to: "/agents/new",
              hash: (prevHash) => prevHash!,
            })
          }
          disabled={!isAdmin}
          disabledReason={t("Requiere permisos de administrador")}
        />
        {agents
          ?.filter((a) => a.user_id === null)
          .map((agent) => {
            const mode = state(agent.mode || "active");
            const open = pathname === `/agents/${agent.id}`;

            return (
              <SectionItem
                key={agent.id}
                title={agent.name}
                description={
                  <span className="flex min-w-0 items-center gap-[8px]">
                    <Badge tone={mode.tone}>{mode.label}</Badge>
                    {agent.id === organization?.entry_agent_id && (
                      <Badge tone="kraft" icon={ArrowDownToLine}>
                        {t("Entrada")}
                      </Badge>
                    )}
                  </span>
                }
                aside={
                  <Avatar
                    src={agent.picture}
                    fallback={agent.name?.substring(0, 2).toUpperCase()}
                    size={40}
                    className="bg-muted text-muted-foreground"
                  />
                }
                className={open ? "bg-accent" : ""}
                onClick={() =>
                  navigate({
                    to: `/agents/${agent.id}`,
                    hash: (prevHash) => prevHash!,
                  })
                }
              />
            );
          })}
      </SectionBody>
    </>
  );
}
