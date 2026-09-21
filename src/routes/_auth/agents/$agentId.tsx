import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import SectionHeader from "@/components/SectionHeader";
import { useTranslation } from "@/hooks/useTranslation";
import {
  useAgent,
  useDeleteAgent,
  useUpdateAgent,
  useCurrentAgent,
} from "@/queries/useAgents";
import { useForm } from "react-hook-form";
import SectionBody from "@/components/SectionBody";
import useBoundStore from "@/stores/useBoundStore";
import { type AIAgentRow, type AIAgentUpdate } from "@/supabase/client";
import { openLocalDirect } from "@/utils/ConversationUtils";
import { openSandbox, simulatorAddress } from "@/utils/SimulatorUtils";
import { useOrganizationsAddresses } from "@/queries/useOrganizationsAddresses";
import SectionFooter from "@/components/SectionFooter";
import Button from "@/components/Button";
import SelectField from "@/components/SelectField";
import TextAreaField from "@/components/TextAreaField";
import ToolsSection from "@/components/ToolsSection";
import ModelSection from "@/components/ModelSection";
import TemplateSection from "@/components/TemplateSection";
import SwitchField from "@/components/SwitchField";
import EntryAgentSwitch from "@/components/EntryAgentSwitch";

export const Route = createFileRoute("/_auth/agents/$agentId")({
  component: AgentDetail,
});

function AgentDetail() {
  const { translate: t } = useTranslation();
  const navigate = useNavigate();
  const { agentId } = Route.useParams();
  const { data: agent } = useAgent<AIAgentRow>(agentId);
  const { data: currentAgent } = useCurrentAgent();
  const isAdmin = ["admin", "owner"].includes(currentAgent?.role || "");
  const deleteAgent = useDeleteAgent();
  const updateAgent = useUpdateAgent();
  const activeOrgId = useBoundStore((state) => state.ui.activeOrgId);

  const addresses = useOrganizationsAddresses().data;

  const localAddress = addresses?.find(
    (address) => address.service === "local",
  );

  // S1: one per organization, minted with the `local` one.
  const sandboxAddress = addresses?.find(
    (address) => address.service === "sandbox",
  );

  // Normalize agent data to ensure tools is always an array
  const normalizedAgent = useMemo(() => {
    if (!agent) return undefined;
    return {
      ...agent,
      extra: {
        ...agent.extra,
        tools: agent.extra?.tools ?? [],
      },
    };
  }, [agent]);

  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { isDirty, isValid },
  } = useForm<AIAgentUpdate>({ values: normalizedAgent });

  const handleChat = async () => {
    if (!activeOrgId || !localAddress || !currentAgent) return;

    // A local DM with the AI agent: a direct is DEFINED by its roster, so the
    // address IS the participant list — no per-conversation agent override
    // exists any more. Which also means there is only ever ONE of these, so
    // this opens the room rather than starting a new one.
    const convId = await openLocalDirect({
      organization_id: activeOrgId,
      organization_address: localAddress.address,
      roster: [currentAgent.id, agentId],
      name: agent?.name,
    });

    void navigate({ hash: convId });
  };

  // S1 — the drill. Unlike the DM above this walks the real path: the agent
  // is chosen by H1's routing, the conversation gets an owner, the welcome
  // message fires and the agent may hand over to a person. Which agent
  // answers is therefore the ORGANIZATION's business, not this screen's —
  // it is whatever routing picks, and if that is not this agent, that is
  // itself the thing worth finding out before a customer does.
  const handleSimulate = async () => {
    if (!activeOrgId || !sandboxAddress || !currentAgent) return;

    const convId = await openSandbox({
      organization_id: activeOrgId,
      organization_address: sandboxAddress.address,
      address: simulatorAddress(currentAgent.id),
      name: t("Simulador"),
    });

    void navigate({ hash: convId });
  };

  return (
    agent && (
      <>
        <SectionHeader
          title={agent.name}
          onDelete={() => {
            deleteAgent.mutate(agentId, {
              onSuccess: () =>
                navigate({ to: "..", hash: (prevHash) => prevHash! }),
            });
          }}
          deleteDisabled={!isAdmin}
          deleteDisabledReason={t("Requiere permisos de administrador")}
          deleteLoading={deleteAgent.isPending}
        />

        <SectionBody>
          <form
            id="agent-form"
            onSubmit={handleSubmit((data) => updateAgent.mutate(data))}
          >
            {/* Root view fields */}
            <label>
              <div className="label">{t("Nombre")}</div>
              <input
                type="text"
                className="text"
                placeholder={t("Nombre del agente")}
                {...register("name", { required: true })}
              />
            </label>

            <SelectField
              name="extra.mode"
              control={control}
              label={t("Estado")}
              options={[
                { value: "active", label: t("Activo") },
                // H6: `draft` existed in the data and not in this list, so
                // the one way to reach it was to not have a mode at all.
                { value: "draft", label: t("Borrador") },
                { value: "inactive", label: t("Inactivo") },
              ]}
            />

            <TextAreaField
              name="extra.description"
              control={control}
              label={t("Descripción")}
              placeholder={t("De qué se ocupa este agente")}
            />

            {/* H6: who takes a conversation nobody has taken yet. It is the
                organization's setting, not the agent's, so it saves on its
                own rather than with this form. */}
            <EntryAgentSwitch agentId={agentId} disabled={!isAdmin} />

            <SwitchField
              name="extra.can_escalate"
              control={control}
              defaultChecked
              label={t("Puede derivar a humanos")}
              description={t(
                "Le da la herramienta para entregar la conversación a una persona del equipo",
              )}
            />

            <div className="border-t border-border" />

            {/* T6/T7: for an agent installed from a template this field is the
                OVERRIDE, not the configuration — the template's own block is
                read-only, further down. Naming it differently is the only
                warning somebody gets before they wonder why the agent still
                says something they did not write. */}
            <TextAreaField
              name="extra.instructions"
              control={control}
              label={
                agent?.template_id ? t("Tus instrucciones") : t("Instrucciones")
              }
              placeholder={t("Eres un asistente útil...")}
            />

            {/* Tools Section */}
            <ToolsSection
              control={control}
              register={register}
              setValue={setValue}
            />

            {/* Not model configuration, and so not part of what T2 took
                away: how long the agent waits for the contact to finish
                typing, and what it says before it is asked anything. */}
            <label>
              <div className="label">{t("Demora de respuesta (segundos)")}</div>
              <input
                type="number"
                className="text"
                min={0}
                placeholder="3"
                {...register("extra.response_delay_seconds", {
                  valueAsNumber: true,
                })}
              />
            </label>

            <TextAreaField
              control={control}
              name="extra.welcome_message"
              label={t("Mensaje de bienvenida")}
              placeholder={t(
                "Hola! Soy un agente virtual. ¿En qué puedo ayudarte?",
              )}
            />

            {/* T2: what the agent runs on. Three levels instead of the
                seven fields this used to ask for (D12). */}
            <ModelSection control={control} register={register} />
          </form>

          {/* T7: outside the form on purpose. Everything here saves on its
              own — updating a version, switching automatic updates, unlinking
              — because none of it is a field of the agent, it is what the
              agent is based on. */}
          {agent && <TemplateSection agent={agent} isAdmin={isAdmin} />}
        </SectionBody>

        <SectionFooter>
          {!isDirty ? (
            <>
              <button
                type="button"
                onClick={() => void handleChat()}
                disabled={!localAddress}
              >
                {t("Chatea con este agente")}
              </button>
              <button
                type="button"
                className="primary"
                onClick={() => void handleSimulate()}
                disabled={!sandboxAddress}
                title={t(
                  "Escribe como si fueras un cliente: bienvenida, asignación y derivación a una persona, igual que en WhatsApp.",
                )}
              >
                {t("Probar como cliente")}
              </button>
            </>
          ) : (
            <Button
              form="agent-form"
              type="submit"
              disabled={!isAdmin}
              invalid={!isValid}
              loading={updateAgent.isPending}
              disabledReason={t("Requiere permisos de administrador")}
              className="primary"
            >
              {t("Actualizar")}
            </Button>
          )}
        </SectionFooter>
      </>
    )
  );
}
