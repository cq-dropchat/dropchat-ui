import { useState } from "react";
import { ArrowUp, LayoutTemplate, Unlink } from "lucide-react";
import Button from "@/components/Button";
import Alert from "@/components/ui/Alert";
import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import DrillPanel from "@/components/ui/DrillPanel";
import DrillRow from "@/components/ui/DrillRow";
import SwitchRow from "@/components/ui/SwitchRow";
import { useTranslation } from "@/hooks/useTranslation";
import { fill } from "@/i18n/translations";
import { useUpdateAgent } from "@/queries/useAgents";
import {
  type AgentTemplateVersion,
  useAgentTemplates,
  useAgentTemplateVersions,
  useUnlinkAgentTemplate,
  useUpdateAgentTemplateVersion,
} from "@/queries/useAgentTemplates";
import { toast } from "@/stores/useToasts";
import type { AIAgentExtra, AIAgentRow } from "@/supabase/client";

/**
 * T7 — what an agent installed from a template says about itself.
 *
 * The agent carries no copy of the template (T6): it points at a version, and
 * its own `extra` is the override layer. Nothing of that is visible from the
 * rest of the screen, which is why this block exists — what it is based on,
 * whether there is a newer version and what would actually change, whether the
 * version it runs on was pulled, and how to stop being a template at all.
 */

/**
 * The fields worth naming in an update notice, with a label a shop owner can
 * read. Built with t() on literals — a key reached through a variable is
 * invisible to `translations:check` and reported as unused in every locale.
 */
function fieldLabel(field: string, t: (text: string) => string): string | null {
  switch (field) {
    case "instructions":
      return t("Instrucciones");
    case "guardrails":
      return t("Reglas de la plantilla");
    case "tools":
      return t("Herramientas");
    case "model_tier":
      return t("Nivel de modelo");
    case "welcome_message":
      return t("Mensaje de bienvenida");
    case "response_delay_seconds":
      return t("Demora de respuesta");
    case "can_escalate":
      return t("Derivar a una persona");
    default:
      // D12: a key nobody wrote a sentence for is not shown raw.
      return null;
  }
}

/**
 * What the new version changes AND this organization has overridden — that is,
 * what will NOT change for them if they update. Saying "actualizá" without
 * saying this is how somebody updates and then wonders why nothing moved.
 */
function overriddenChanges(
  current: AgentTemplateVersion | undefined,
  next: AgentTemplateVersion | undefined,
  extra: AIAgentExtra | null,
): string[] {
  if (!current || !next || !extra) return [];

  const before = (current.config ?? {}) as Record<string, unknown>;
  const after = (next.config ?? {}) as Record<string, unknown>;

  return Object.keys(after).filter(
    (key) =>
      key in extra &&
      JSON.stringify(before[key]) !== JSON.stringify(after[key]),
  );
}

/** The version this agent runs on, when it runs on one at all. */
function useInstalledVersion(agent: AIAgentRow) {
  const { data: versions } = useAgentTemplateVersions(agent.template_id);

  return versions?.find((row) => row.version === agent.template_version);
}

/**
 * B3 — the template's own instructions, beside the organization's.
 *
 * It belongs in the card that holds «Tus instrucciones» and not in the
 * template block further down: the difference between the two used to be one
 * word in a label, and the question it answers — «why does the agent still
 * say something I did not write» — is asked while looking at the field you
 * DID write.
 */
export function TemplateInstructionsRow({ agent }: { agent: AIAgentRow }) {
  const { translate: t } = useTranslation();
  const [reading, setReading] = useState(false);
  const current = useInstalledVersion(agent);

  if (!agent.template_id || agent.template_version === null) return null;

  const instructions =
    ((current?.config ?? {}) as AIAgentExtra).instructions ??
    t("Esta versión no trae instrucciones.");

  return (
    <>
      <DrillRow
        readOnly
        label={t("Instrucciones de la plantilla")}
        onClick={() => setReading(true)}
      >
        <span className="text-kraft-foreground block text-[13px] leading-[1.45]">
          {fill(
            t(
              "Vienen de la v{n} y no se editan acá. Las lee el agente antes que las tuyas.",
            ),
            { n: agent.template_version },
          )}
        </span>
      </DrillRow>

      {reading && (
        <DrillPanel
          title={t("Instrucciones de la plantilla")}
          subtitle={agent.name}
          onBack={() => setReading(false)}
          footer={
            <button
              type="button"
              className="secondary"
              onClick={() => setReading(false)}
            >
              {t("Listo")}
            </button>
          }
        >
          <Alert tone="kraft" title={t("Solo lectura")}>
            {t(
              "Lo que escribas vos va en «Tus instrucciones» y se suma a esto, no lo reemplaza.",
            )}
          </Alert>

          <label htmlFor="template-instructions" className="sr-only">
            {t("Instrucciones de la plantilla")}
          </label>
          <textarea
            id="template-instructions"
            readOnly
            value={instructions}
            className="text grow font-mono text-[14px] leading-[1.6]"
          />
        </DrillPanel>
      )}
    </>
  );
}

export default function TemplateSection({
  agent,
  isAdmin,
}: {
  agent: AIAgentRow;
  isAdmin: boolean;
}) {
  const { translate: t } = useTranslation();
  const [unlinking, setUnlinking] = useState(false);

  const { data: templates } = useAgentTemplates();
  const { data: versions } = useAgentTemplateVersions(agent.template_id);
  const takeVersion = useUpdateAgentTemplateVersion();
  const unlink = useUnlinkAgentTemplate();
  const updateAgent = useUpdateAgent();
  const current = useInstalledVersion(agent);

  if (!agent.template_id || agent.template_version === null) return null;

  const template = templates?.find((row) => row.id === agent.template_id);
  // The newest one anybody can still install. A retired version is not an
  // update, and the version this agent runs on is visible to it whether or not
  // it was pulled (the policy T7 added).
  const newest = versions
    ?.filter((row) => row.retired_at === null)
    .sort((a, b) => b.version - a.version)[0];

  const update =
    newest && newest.version > agent.template_version ? newest : undefined;

  const frozen = overriddenChanges(current, update, agent.extra)
    .map((field) => fieldLabel(field, t))
    .filter((label): label is string => label !== null);

  const adminOnly = isAdmin
    ? undefined
    : t("Requiere permisos de administrador");

  return (
    <>
      <Card
        title={t("La plantilla")}
        padded={false}
        action={
          <Badge tone="kraft" icon={LayoutTemplate}>
            v{agent.template_version}
          </Badge>
        }
      >
        <p className="text-muted-foreground px-[20px] pb-[14px] text-[13px] leading-[1.5]">
          {fill(t("Este agente viene de «{plantilla}»."), {
            plantilla: template?.name ?? t("una plantilla"),
          })}
        </p>

        {current?.retired_at && (
          <div className="px-[16px] pb-[14px]">
            <Alert tone="warning" title={t("Esta versión ya no se ofrece")}>
              {t("El agente sigue funcionando igual; actualizá cuando puedas.")}
            </Alert>
          </div>
        )}

        {update && (
          <div className="px-[16px] pb-[14px]">
            <Alert
              tone="primary"
              icon={ArrowUp}
              title={fill(t("Hay una versión nueva: la v{n}"), {
                n: update.version,
              })}
            >
              <div className="flex flex-col gap-[8px]">
                {update.changelog && <p>{update.changelog}</p>}

                {frozen.length > 0 && (
                  <p>
                    {t("No va a cambiar lo que editaste vos:")}{" "}
                    <strong className="font-semibold">
                      {frozen.join(", ")}
                    </strong>
                    .
                  </p>
                )}

                <div>
                  <Button
                    type="button"
                    className="primary"
                    disabled={!isAdmin}
                    disabledReason={adminOnly}
                    loading={takeVersion.isPending}
                    onClick={() =>
                      takeVersion.mutate(
                        { agentId: agent.id, version: update.version },
                        {
                          onSuccess: () =>
                            toast.success(
                              fill(t("Actualizaste a la v{n}"), {
                                n: update.version,
                              }),
                              t("Lo que editaste vos sigue como estaba."),
                            ),
                          onError: (error) =>
                            toast.error(
                              t("No se pudo actualizar"),
                              error.message,
                            ),
                        },
                      )
                    }
                  >
                    {fill(t("Actualizar a la v{n}"), { n: update.version })}
                  </Button>
                </div>
              </div>
            </Alert>
          </div>
        )}

        <SwitchRow
          label={t("Actualizar automáticamente")}
          description={t(
            "Toma cada versión nueva apenas sale, sin tocar lo que editaste vos.",
          )}
          note={t("Se guarda al instante")}
          checked={agent.template_auto_update}
          disabled={!isAdmin || updateAgent.isPending}
          disabledReason={adminOnly}
          onCheckedChange={(checked) =>
            updateAgent.mutate(
              { id: agent.id, template_auto_update: checked },
              {
                onSuccess: () =>
                  toast.success(
                    checked
                      ? t("Se actualiza solo")
                      : t("Ya no se actualiza solo"),
                    checked
                      ? t("Cada versión nueva entra apenas sale.")
                      : t("Te vamos a avisar cuando haya una versión nueva."),
                  ),
                onError: (error) =>
                  toast.error(t("No se pudo guardar"), error.message),
              },
            )
          }
        />

        <div className="border-border flex flex-col items-start gap-[8px] border-t p-[14px_16px]">
          <Button
            type="button"
            className="secondary"
            disabled={!isAdmin}
            disabledReason={adminOnly}
            onClick={() => setUnlinking(true)}
          >
            <Unlink className="h-[16px] w-[16px]" aria-hidden />
            {t("Desvincular de la plantilla")}
          </Button>
          <span className="hint">
            {t(
              "Se queda con lo que tiene ahora y deja de recibir versiones nuevas.",
            )}
          </span>
        </div>
      </Card>

      <ConfirmDialog
        open={unlinking}
        title={t("¿Desvincular de la plantilla?")}
        confirmLabel={t("Desvincular")}
        loading={unlink.isPending}
        onCancel={() => setUnlinking(false)}
        onConfirm={() =>
          unlink.mutate(agent.id, {
            onSuccess: () => {
              setUnlinking(false);
              toast.success(
                t("Desvinculaste el agente"),
                t("Se queda como está y no recibe más versiones."),
              );
            },
            onError: (error) =>
              toast.error(t("No se pudo desvincular"), error.message),
          })
        }
      >
        {t(
          "El agente se queda con la configuración que tiene ahora y deja de recibir versiones nuevas.",
        )}
      </ConfirmDialog>
    </>
  );
}
