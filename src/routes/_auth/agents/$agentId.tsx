import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import SectionHeader from "@/components/SectionHeader";
import { useTranslation } from "@/hooks/useTranslation";
import {
  useAgent,
  useDeleteAgent,
  useUpdateAgent,
  useCurrentAgent,
} from "@/queries/useAgents";
import { useForm, useWatch } from "react-hook-form";
import SectionBody from "@/components/SectionBody";
import useBoundStore from "@/stores/useBoundStore";
import { type AIAgentRow, type AIAgentUpdate } from "@/supabase/client";
import { openLocalDirect } from "@/utils/ConversationUtils";
import { openSandbox, simulatorAddress } from "@/utils/SimulatorUtils";
import { useOrganizationsAddresses } from "@/queries/useOrganizationsAddresses";
import SectionFooter from "@/components/SectionFooter";
import {
  protocols,
  protocolLabels,
  defaultModels,
  creditModels,
  apiKeyInstructions,
} from "./new";
import Button from "@/components/Button";
import SelectField from "@/components/SelectField";
import TextAreaField from "@/components/TextAreaField";
import SectionField from "@/components/SectionField";
import ToolsSection from "@/components/ToolsSection";
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
  const [provider, setProvider] = useState<keyof typeof protocols>("openai");

  const addresses = useOrganizationsAddresses().data;

  const localAddress = addresses?.find(
    (address) => address.service === "local",
  );

  // S1: one per organization, minted with the `local` one.
  const sandboxAddress = addresses?.find(
    (address) => address.service === "sandbox",
  );

  useEffect(() => {
    if (!agent) return;
    const apiUrl = agent.extra?.api_url || "";
    const isKnown = ["openai", "anthropic", "groq", "google"].includes(apiUrl);
    setProvider(isKnown ? apiUrl : "custom");
  }, [agent]);

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

  const model = useWatch({ control, name: "extra.model" });

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

            <TextAreaField
              name="extra.instructions"
              control={control}
              label={t("Instrucciones")}
              placeholder={t("Eres un asistente útil...")}
            />

            {/* Tools Section */}
            <ToolsSection
              control={control}
              register={register}
              setValue={setValue}
            />

            {/* AI Section */}
            <SectionField
              label={t("Modelo de IA")}
              description={model || t("Ninguno")}
            >
              <SelectField
                value={provider}
                modalClassName="bottom-0"
                onChange={(val) => {
                  setProvider(val);
                  setValue("extra.model", defaultModels[val] || "");

                  const availableProtocols =
                    protocols[val as keyof typeof protocols];
                  setValue("extra.protocol", availableProtocols[0]);

                  if (val !== "custom") {
                    setValue("extra.api_url", val, { shouldDirty: true });
                  } else {
                    setValue("extra.api_url", "", { shouldDirty: true });
                  }
                }}
                label={t("Proveedor")}
                options={[
                  { value: "openai", label: "OpenAI" },
                  { value: "anthropic", label: "Anthropic" },
                  { value: "groq", label: "Groq" },
                  { value: "google", label: "Google" },
                  { value: "custom", label: t("Personalizado") },
                ]}
              />

              <SelectField
                name="extra.protocol"
                control={control}
                modalClassName="bottom-0"
                label={t("Protocolo")}
                options={(
                  protocols[provider as keyof typeof protocols] || []
                ).map((p) => ({
                  value: p,
                  label: protocolLabels[p] || p,
                }))}
              />

              {provider === "custom" && (
                <label>
                  <div className="label">{t("API URL")}</div>
                  <input
                    type="text"
                    className="text"
                    placeholder="https://api.example.com/v1"
                    {...register("extra.api_url")}
                  />
                </label>
              )}

              <label>
                <div className="label">{t("Clave API")}</div>
                <input
                  type="text"
                  className="text"
                  placeholder={t("Clave API del proveedor")}
                  {...register("extra.api_key")}
                />
              </label>

              {provider !== "custom" && apiKeyInstructions[provider] && (
                <div className="instructions">
                  <p>
                    {t(
                      "Usar una clave API propia no consume créditos locales y permite usar cualquier modelo.",
                    )}
                  </p>
                  <p>
                    <strong>
                      {apiKeyInstructions[provider].free
                        ? t("Obtené una clave gratuita:")
                        : t("Obtené una clave:")}
                    </strong>{" "}
                    <a
                      href={apiKeyInstructions[provider].url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                    >
                      {apiKeyInstructions[provider].label}
                    </a>
                    {" > "}
                    {apiKeyInstructions[provider].steps}
                  </p>
                </div>
              )}

              <label>
                <div className="label">{t("Modelo")}</div>
                <input
                  type="text"
                  className="text"
                  placeholder={t("Nombre del modelo")}
                  {...register("extra.model")}
                />
              </label>

              {provider !== "custom" && creditModels[provider] && (
                <div className="instructions">
                  <p>
                    {t("Los siguientes modelos funcionan con créditos de IA:")}
                  </p>
                  <ul>
                    {creditModels[provider].map((m) => (
                      <li key={m}>
                        <code>{m}</code>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <label>
                <div className="label">
                  {t("Demora de respuesta (segundos)")}
                </div>
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

              <label>
                <div className="label">{t("Mensajes máximos")}</div>
                <input
                  type="number"
                  className="text"
                  min={1}
                  placeholder="50"
                  {...register("extra.max_messages", { valueAsNumber: true })}
                />
              </label>

              <label>
                <div className="label">{t("Temperatura")}</div>
                <input
                  type="number"
                  className="text"
                  min={0}
                  max={2}
                  step={0.1}
                  placeholder="1.0"
                  {...register("extra.temperature", { valueAsNumber: true })}
                />
              </label>

              <SwitchField
                name="extra.multi_message_response"
                control={control}
                defaultChecked
                label={t("Respuestas en varios mensajes")}
                description={t(
                  "Desactivar para modelos de razonamiento que no permiten forzar herramientas",
                )}
              />

              {provider === "custom" && (
                <div className="instructions">
                  <p>
                    {t(
                      "Se envían los siguientes encabezados HTTP con cada solicitud:",
                    )}
                  </p>
                  <ul>
                    <li>
                      <code>organization-id</code>
                    </li>
                    <li>
                      <code>organization-address</code>
                    </li>
                    <li>
                      <code>conversation-id</code>
                    </li>
                    <li>
                      <code>agent-id</code>
                    </li>
                    <li>
                      <code>contact-id</code>
                    </li>
                    <li>
                      <code>contact-address</code>
                    </li>
                  </ul>
                </div>
              )}
            </SectionField>
          </form>
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
