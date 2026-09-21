import SwitchRow from "@/components/ui/SwitchRow";
import { useTranslation } from "@/hooks/useTranslation";
import {
  useCurrentOrganization,
  useUpdateCurrentOrganization,
} from "@/queries/useOrganizations";
import { toast } from "@/stores/useToasts";

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
 * Which is why it says so. The row carries «se guarda al instante» and the
 * flip raises a notice: a switch that does not wait for «Guardar», sitting
 * among ten that do, is otherwise indistinguishable from them.
 *
 * Turning it off leaves the organization with no entry agent, which is a
 * real state: routing then falls back to the oldest eligible agent, exactly
 * as it did before H1.
 */
export default function EntryAgentSwitch({
  agentId,
  disabled,
  disabledReason,
  last,
}: {
  agentId: string;
  disabled?: boolean;
  disabledReason?: string;
  last?: boolean;
}) {
  const { translate: t } = useTranslation();
  const { data: organization } = useCurrentOrganization();
  const updateOrganization = useUpdateCurrentOrganization();

  const isEntry = organization?.entry_agent_id === agentId;

  return (
    <SwitchRow
      label={t("Agente de entrada")}
      description={t(
        "Atiende las conversaciones que todavía no tienen agente. Hay uno solo a la vez.",
      )}
      note={t("Se guarda al instante")}
      checked={isEntry}
      disabled={disabled || updateOrganization.isPending}
      disabledReason={disabledReason}
      last={last}
      onCheckedChange={(checked) =>
        updateOrganization.mutate(
          {
            id: organization?.id,
            entry_agent_id: checked ? agentId : null,
          },
          {
            onSuccess: () =>
              toast.success(
                checked
                  ? t("Ahora entra por acá")
                  : t("Ya no es el agente de entrada"),
                checked
                  ? t(
                      "Las conversaciones nuevas sin agente las toma este agente.",
                    )
                  : t(
                      "Sin agente de entrada, una conversación nueva la toma el agente más antiguo.",
                    ),
              ),
            onError: (error) =>
              toast.error(
                t("No se pudo cambiar el agente de entrada"),
                error.message,
              ),
          },
        )
      }
    />
  );
}
