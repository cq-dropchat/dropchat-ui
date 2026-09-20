import Switch from "@/components/Switch";
import { useTranslation } from "@/hooks/useTranslation";
import {
  useCurrentOrganization,
  useUpdateCurrentOrganization,
} from "@/queries/useOrganizations";

/**
 * H6 — "this is the agent that takes a new conversation".
 *
 * It lives on the agent's screen because that is where somebody asks the
 * question, and it writes `organizations.entry_agent_id` because the answer
 * is the organization's: there is exactly one, and naming a new one unnames
 * the old one. So it saves by itself rather than with the agent's form —
 * submitting the agent would otherwise silently carry a change to a
 * different row.
 *
 * Turning it off leaves the organization with no entry agent, which is a
 * real state: routing then falls back to the oldest eligible agent, exactly
 * as it did before H1.
 */
export default function EntryAgentSwitch({
  agentId,
  disabled,
}: {
  agentId: string;
  disabled?: boolean;
}) {
  const { translate: t } = useTranslation();
  const { data: organization } = useCurrentOrganization();
  const updateOrganization = useUpdateCurrentOrganization();

  const isEntry = organization?.entry_agent_id === agentId;

  return (
    <label className="flex items-center gap-[12px] cursor-pointer justify-between">
      <div className="flex flex-col gap-[2px]">
        <div className="text-foreground">{t("Agente de entrada")}</div>
        <p className="text-muted-foreground text-[14px]">
          {t("Atiende las conversaciones que todavía no tienen agente")}
        </p>
      </div>
      <Switch
        checked={isEntry}
        disabled={disabled || updateOrganization.isPending}
        onCheckedChange={(checked) =>
          updateOrganization.mutate({
            id: organization?.id,
            entry_agent_id: checked ? agentId : null,
          })
        }
        className="mt-[4px]"
      />
    </label>
  );
}
