import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  LayoutTemplate,
  Lock,
  MessageSquare,
  Pencil,
  Play,
  Trash2,
} from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
import Avatar from "@/components/Avatar";
import Button from "@/components/Button";
import { LinkButton } from "@/components/LinkButton";
import ModelSection from "@/components/ModelSection";
import SwitchField from "@/components/SwitchField";
import EntryAgentSwitch from "@/components/EntryAgentSwitch";
import TemplateSection, {
  TemplateInstructionsRow,
} from "@/components/TemplateSection";
import TextAreaField from "@/components/TextAreaField";
import ToolsSection from "@/components/ToolsSection";
import Alert from "@/components/ui/Alert";
import Badge, { type Tone } from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import Field from "@/components/ui/Field";
import SegmentedControl from "@/components/ui/SegmentedControl";
import Skeleton from "@/components/ui/Skeleton";
import useHasChanges from "@/hooks/useHasChanges";
import { useTranslation } from "@/hooks/useTranslation";
import { fill } from "@/i18n/translations";
import {
  useAgent,
  useDeleteAgent,
  useUpdateAgent,
  useCurrentAgent,
} from "@/queries/useAgents";
import { useCurrentOrganization } from "@/queries/useOrganizations";
import { useOrganizationsAddresses } from "@/queries/useOrganizationsAddresses";
import useBoundStore from "@/stores/useBoundStore";
import { toast } from "@/stores/useToasts";
import { type AIAgentRow, type AIAgentUpdate } from "@/supabase/client";
import { openLocalDirect } from "@/utils/ConversationUtils";
import { openSandbox, simulatorAddress } from "@/utils/SimulatorUtils";

/** How long a description may be before it stops being one. */
const DESCRIPTION_MAX = 160;

type Mode = "active" | "draft" | "inactive";

const MODES: Mode[] = ["active", "draft", "inactive"];

/**
 * What each state is called and what it means, said where the choice is made
 * rather than nowhere.
 *
 * A switch on literals and not a table keyed by mode: a key reached through a
 * variable is invisible to `translations:check`, which then reports every one
 * of these sentences as unused in all four locales.
 */
function modeInfo(
  mode: Mode,
  t: (text: string) => string,
): { tone: Tone; label: string; hint: string } {
  switch (mode) {
    case "draft":
      return {
        tone: "neutral",
        label: t("Borrador"),
        hint: t("No contesta a nadie. Sirve para escribirlo y probarlo."),
      };
    case "inactive":
      return {
        tone: "neutral",
        label: t("Inactivo"),
        hint: t("No contesta y no se le asignan conversaciones nuevas."),
      };
    default:
      return {
        tone: "primary",
        label: t("Activo"),
        hint: t("Contesta las conversaciones que se le asignen."),
      };
  }
}

/**
 * One agent, and everything an organization can decide about it.
 *
 * It lives here rather than in the route file because it is also the only
 * way to look at it without signing in: `dev/agents.html` mounts it with a
 * stubbed PostgREST, the way the template panel is mounted.
 */
export default function AgentEditor({ agentId }: { agentId: string }) {
  const { translate: t } = useTranslation();
  const navigate = useNavigate();
  const { data: agent, isPending } = useAgent<AIAgentRow>(agentId);
  const { data: currentAgent } = useCurrentAgent();
  const { data: organization } = useCurrentOrganization();
  const isAdmin = ["admin", "owner"].includes(currentAgent?.role || "");
  const deleteAgent = useDeleteAgent();
  const updateAgent = useUpdateAgent();
  const activeOrgId = useBoundStore((state) => state.ui.activeOrgId);

  const [deleting, setDeleting] = useState(false);

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
    reset,
    formState: { isValid, errors },
  } = useForm<AIAgentUpdate>({ values: normalizedAgent });

  const changed = useHasChanges(control);

  const mode = (useWatch({ control, name: "extra.mode" }) ?? "active") as Mode;
  const state = modeInfo(mode, t);
  const description = useWatch({ control, name: "extra.description" }) ?? "";

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

  if (isPending) return <LoadingAgent />;
  if (!agent) return null;

  const fromTemplate = !!agent.template_id && agent.template_version !== null;
  const isEntry = organization?.entry_agent_id === agent.id;
  const adminOnly = isAdmin
    ? undefined
    : t("Requiere permisos de administrador");

  // Testing changes you have not saved tests the SAVED agent, which is the
  // most expensive kind of wrong answer this screen can give.
  const actionBlocked = changed
    ? t("Guardá los cambios para probarlos.")
    : undefined;

  return (
    <>
      <div className="border-border bg-background flex shrink-0 items-center gap-[10px] border-b px-[14px] pt-[10px] pb-[12px]">
        <LinkButton
          to=".."
          title={t("Volver")}
          className="-ml-[8px] flex h-[28px] w-[28px] items-center justify-center"
        >
          <ArrowLeft className="h-[22px] w-[22px]" aria-hidden />
        </LinkButton>

        <Avatar
          src={agent.picture}
          fallback={agent.name?.substring(0, 2)}
          size={36}
          className="bg-secondary text-secondary-foreground shrink-0 font-mono text-[13px]"
        />

        {/* The badges sit beside the name and drop below it only when they
            stop fitting. On their own row they were a near-empty band: most
            agents carry one short chip, and the panel is 340px of height
            nobody has to spare. */}
        <div className="flex min-w-0 grow flex-wrap items-center gap-x-[8px] gap-y-[6px]">
          <h1 className="font-display max-w-full min-w-0 truncate text-[19px] font-bold tracking-[-0.01em] [font-stretch:112%]">
            {agent.name}
          </h1>

          <Badge tone={state.tone}>{state.label}</Badge>

          {isEntry && (
            <Badge tone="kraft" icon={ArrowDownToLine}>
              {t("Agente de entrada")}
            </Badge>
          )}

          {fromTemplate && (
            <Badge tone="kraft" icon={LayoutTemplate}>
              {fill(t("De plantilla · v{n}"), { n: agent.template_version! })}
            </Badge>
          )}

          {!isAdmin && (
            <Badge tone="neutral" icon={Lock}>
              {t("Solo lectura")}
            </Badge>
          )}
        </div>

        <Button
          type="button"
          aria-label={t("Eliminar este agente")}
          title={t("Eliminar")}
          disabled={!isAdmin}
          disabledReason={adminOnly}
          loading={deleteAgent.isPending}
          onClick={() => setDeleting(true)}
          className="hover:bg-muted text-secondary-foreground -mr-[8px] h-[44px] w-[44px] shrink-0 rounded-full"
        >
          <Trash2 className="h-[20px] w-[20px]" aria-hidden />
        </Button>
      </div>

      <div className="flex grow flex-col gap-[14px] overflow-y-auto px-[12px] py-[14px] [scrollbar-gutter:stable]">
        {/* D12: «no tenés permiso» used to live in a `title` attribute on a
            disabled button — invisible on a touch screen, and unreadable by
            anybody who never hovers. */}
        {!isAdmin && (
          <Alert
            tone="neutral"
            icon={Lock}
            title={t("Podés mirarlo, no cambiarlo")}
          >
            {t(
              "Cambiar un agente necesita permisos de administrador. Pedíselos a quien creó la organización.",
            )}
          </Alert>
        )}

        <form
          id="agent-form"
          onSubmit={handleSubmit((data) =>
            updateAgent.mutate(data, {
              onSuccess: () =>
                toast.success(
                  fill(t("Guardaste a {agente}"), { agente: agent.name }),
                  t("La próxima conversación ya usa esta configuración."),
                ),
              onError: (error) =>
                toast.error(
                  t("No se pudo guardar"),
                  error.message ||
                    t("Tus cambios siguen en pantalla. Probá de nuevo."),
                ),
            }),
          )}
          className="flex grow-0 flex-col gap-[14px] pl-0"
        >
          <Card title={t("Identidad")}>
            <Field
              label={t("Nombre")}
              hint={t("Lo ve tu equipo en la conversación, no el cliente.")}
              error={errors.name ? t("Poné un nombre") : undefined}
            >
              {(field) => (
                <input
                  {...field}
                  type="text"
                  className="text"
                  placeholder={t("Nombre del agente")}
                  disabled={!isAdmin}
                  {...register("name", { required: true })}
                />
              )}
            </Field>

            <Field
              label={t("Descripción")}
              optional={t("opcional")}
              count={{
                value: String(description).length,
                max: DESCRIPTION_MAX,
              }}
            >
              {(field) => (
                <textarea
                  {...field}
                  rows={2}
                  className="text"
                  placeholder={t("De qué se ocupa este agente")}
                  disabled={!isAdmin}
                  {...register("extra.description")}
                />
              )}
            </Field>

            {/* H6: `draft` existed in the data and not in the list of
                options, so the one way to reach it was to not have a mode at
                all. Three options fit on one line — a drill-down to choose
                between three words was a door for nothing. */}
            <div className="flex flex-col gap-[8px]">
              <span className="label mb-0">{t("Estado")}</span>
              <SegmentedControl<Mode>
                label={t("Estado")}
                value={mode}
                disabled={!isAdmin}
                disabledReason={adminOnly}
                options={MODES.map((value) => ({
                  value,
                  label: modeInfo(value, t).label,
                }))}
                onChange={(value) =>
                  setValue("extra.mode", value, {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                }
              />
              <span className="hint">{state.hint}</span>
            </div>
          </Card>

          <Card title={t("Cómo atiende")} padded={false}>
            {/* H6: who takes a conversation nobody has taken yet. It is the
                organization's setting, not the agent's, so it saves on its
                own rather than with this form — and says so. */}
            <EntryAgentSwitch
              agentId={agentId}
              disabled={!isAdmin}
              disabledReason={adminOnly}
            />

            <SwitchField
              name="extra.can_escalate"
              control={control}
              defaultChecked
              disabled={!isAdmin}
              disabledReason={adminOnly}
              label={t("Puede derivar a una persona")}
              description={t(
                "Cuando no sabe qué contestar, entrega la conversación a alguien del equipo.",
              )}
            />

            {/* Not model configuration, and so not part of what T2 took
                away: how long the agent waits for the contact to finish
                typing. The unit used to be in the label, in brackets, and
                what it was for was nowhere. */}
            <div className="border-border border-t px-[16px] py-[14px]">
              <Field
                label={t("Demora antes de responder")}
                hint={t(
                  "Espera a que el cliente termine de escribir. Con 3 segundos, tres mensajes seguidos reciben una sola respuesta.",
                )}
              >
                {(field) => (
                  <div className="relative flex items-center">
                    <input
                      {...field}
                      type="number"
                      min={0}
                      placeholder="3"
                      disabled={!isAdmin}
                      className="text pr-[92px] font-mono tabular-nums"
                      {...register("extra.response_delay_seconds", {
                        valueAsNumber: true,
                      })}
                    />
                    <span
                      aria-hidden
                      className="text-muted-foreground absolute right-[14px] text-[14px]"
                    >
                      {t("segundos")}
                    </span>
                  </div>
                )}
              </Field>
            </div>

            <TextAreaField
              control={control}
              name="extra.welcome_message"
              owner={agent.name}
              label={t("Mensaje de bienvenida")}
              hint={t(
                "Se envía una sola vez, en el primer mensaje de la conversación, antes de que el agente conteste nada.",
              )}
              placeholder={t(
                "Hola! Soy un agente virtual. ¿En qué puedo ayudarte?",
              )}
              disabled={!isAdmin}
              disabledReason={adminOnly}
              last
            />
          </Card>

          <Card title={t("Qué dice y qué puede hacer")} padded={false}>
            {/* T6/T7: for an agent installed from a template this field is
                the OVERRIDE, not the configuration — the template's own block
                is read-only, right below. Naming it differently was the only
                warning somebody got before they wondered why the agent still
                says something they did not write. */}
            {fromTemplate && (
              <p className="text-muted-foreground px-[16px] pb-[14px] text-[13px] leading-[1.5]">
                {t("Lo que escribas acá se suma a lo que trae la plantilla.")}{" "}
                {t("No lo reemplaza.")}
              </p>
            )}

            <TextAreaField
              name="extra.instructions"
              control={control}
              owner={agent.name}
              mono
              label={fromTemplate ? t("Tus instrucciones") : t("Instrucciones")}
              badge={
                fromTemplate ? (
                  <Badge tone="primary">{t("Las editás vos")}</Badge>
                ) : undefined
              }
              hint={t(
                "Escribilo como se lo explicarías a alguien nuevo en el equipo: qué vende la tienda, qué pedir siempre, qué nunca prometer.",
              )}
              placeholder={t("Eres un asistente útil...")}
              disabled={!isAdmin}
              disabledReason={adminOnly}
            />

            <TemplateInstructionsRow agent={agent} />

            <ToolsSection
              control={control}
              register={register}
              setValue={setValue}
              owner={agent.name}
              disabled={!isAdmin}
              disabledReason={adminOnly}
              last
            />
          </Card>

          {/* T2: what the agent runs on. Three levels instead of the seven
              fields this used to ask for (D12). */}
          <ModelSection
            control={control}
            register={register}
            owner={agent.name}
            disabled={!isAdmin}
            disabledReason={adminOnly}
          />
        </form>

        {/* T7: outside the form on purpose. Everything here saves on its
            own — updating a version, switching automatic updates, unlinking
            — because none of it is a field of the agent, it is what the
            agent is based on. */}
        <TemplateSection agent={agent} isAdmin={isAdmin} />
      </div>

      {/* The actions used to be swapped out for this button the moment a
          field changed: «Chatea con este agente» and «Probar como cliente»
          simply vanished, with nothing saying why or what to do. */}
      {changed && (
        <div className="border-border bg-primary-veil flex shrink-0 flex-wrap items-center justify-between gap-[10px] border-t px-[16px] py-[12px]">
          <span className="flex min-w-0 items-center gap-[8px]">
            <Pencil
              className="text-primary h-[18px] w-[18px] shrink-0"
              aria-hidden
            />
            <span className="text-[14px] font-semibold">
              {t("Cambios sin guardar")}
            </span>
          </span>

          <span className="ml-auto flex shrink-0 gap-[8px]">
            <button
              type="button"
              className="secondary px-[14px] text-[14px]"
              onClick={() => reset(normalizedAgent)}
            >
              {t("Descartar")}
            </button>

            <Button
              form="agent-form"
              type="submit"
              className="primary px-[16px] text-[14px]"
              disabled={!isAdmin}
              invalid={!isValid}
              loading={updateAgent.isPending}
              disabledReason={
                adminOnly ?? (!isValid ? t("Poné un nombre") : undefined)
              }
            >
              {t("Guardar")}
            </Button>
          </span>
        </div>
      )}

      <div className="border-border bg-background flex shrink-0 flex-col gap-[8px] border-t px-[16px] pt-[12px] pb-[16px]">
        <span className="hint">
          {actionBlocked
            ? t(
                "Una prueba usa la configuración guardada, no la de la pantalla.",
              )
            : t("Las dos abren la conversación en el panel de al lado.")}
        </span>

        {/* They wrap rather than squeeze: at the panel's narrowest the
            second label would otherwise break across two lines and drag the
            icon out of line with it. */}
        <div className="flex flex-wrap gap-[10px]">
          <Button
            type="button"
            className="secondary shrink-0 whitespace-nowrap"
            onClick={() => void handleChat()}
            disabled={!localAddress || changed}
            disabledReason={actionBlocked}
          >
            <MessageSquare className="h-[16px] w-[16px]" aria-hidden />
            {t("Chatear")}
          </Button>

          <Button
            type="button"
            className="primary grow basis-[200px] whitespace-nowrap"
            onClick={() => void handleSimulate()}
            disabled={!sandboxAddress || changed}
            disabledReason={actionBlocked}
            title={t(
              "Escribe como si fueras un cliente: bienvenida, asignación y derivación a una persona, igual que en WhatsApp.",
            )}
          >
            <Play className="h-[16px] w-[16px]" aria-hidden />
            {t("Probar como cliente")}
          </Button>
        </div>
      </div>

      {/* Deleting an agent used to happen on the first click of a bin. */}
      <ConfirmDialog
        open={deleting}
        title={fill(t("¿Eliminar a {agente}?"), { agente: agent.name })}
        confirmLabel={t("Eliminar")}
        loading={deleteAgent.isPending}
        onCancel={() => setDeleting(false)}
        onConfirm={() =>
          deleteAgent.mutate(agentId, {
            onSuccess: () => {
              setDeleting(false);
              toast.success(
                fill(t("Eliminaste a {agente}"), { agente: agent.name }),
                t("Las conversaciones que atendió siguen donde estaban."),
              );
              void navigate({ to: "..", hash: (prevHash) => prevHash! });
            },
            onError: (error) =>
              toast.error(t("No se pudo eliminar"), error.message),
          })
        }
      >
        {t(
          "Deja de contestar en el acto. Las conversaciones que atendió siguen donde estaban, con lo que ya dijo.",
        )}
      </ConfirmDialog>
    </>
  );
}

/**
 * While the agent is on its way.
 *
 * It used to be nothing at all — the screen rendered `agent && (…)`, so an
 * agent that had not arrived and an agent that does not exist looked the
 * same: an empty panel with no explanation.
 */
function LoadingAgent() {
  const { translate: t } = useTranslation();

  return (
    <div
      role="status"
      aria-label={t("Cargando")}
      className="flex flex-col gap-[14px] px-[12px] py-[14px]"
    >
      {[0, 1].map((card) => (
        <Card key={card}>
          <Skeleton width={110} height={16} />
          <Skeleton width="100%" height={48} className="rounded-[12px]" />
          <Skeleton width={140} height={14} />
          <Skeleton width="100%" height={48} className="rounded-[12px]" />
        </Card>
      ))}
    </div>
  );
}
