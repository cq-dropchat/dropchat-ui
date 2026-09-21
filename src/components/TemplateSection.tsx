import { useState } from "react";
import { LayoutTemplate } from "lucide-react";
import Button from "@/components/Button";
import Switch from "@/components/Switch";
import { useTranslation } from "@/hooks/useTranslation";
import { useUpdateAgent } from "@/queries/useAgents";
import {
  type AgentTemplateVersion,
  useAgentTemplates,
  useAgentTemplateVersions,
  useUnlinkAgentTemplate,
  useUpdateAgentTemplateVersion,
} from "@/queries/useAgentTemplates";
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

export default function TemplateSection({
  agent,
  isAdmin,
}: {
  agent: AIAgentRow;
  isAdmin: boolean;
}) {
  const { translate: t } = useTranslation();
  const [confirming, setConfirming] = useState(false);

  const { data: templates } = useAgentTemplates();
  const { data: versions } = useAgentTemplateVersions(agent.template_id);
  const takeVersion = useUpdateAgentTemplateVersion();
  const unlink = useUnlinkAgentTemplate();
  const updateAgent = useUpdateAgent();

  if (!agent.template_id || agent.template_version === null) return null;

  const template = templates?.find((row) => row.id === agent.template_id);
  const current = versions?.find(
    (row) => row.version === agent.template_version,
  );
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

  return (
    <div className="border-border flex flex-col gap-[10px] border-t pt-[10px]">
      <div className="flex items-center gap-[8px]">
        <LayoutTemplate className="text-primary h-[18px] w-[18px]" />
        <span className="text-sm">
          {t("Basado en")} {template?.name ?? t("una plantilla")} v
          {agent.template_version}
        </span>
      </div>

      {current?.retired_at && (
        <p role="alert" className="text-sm">
          {t(
            "Esta versión ya no se ofrece. El agente sigue funcionando igual; actualizá cuando puedas.",
          )}
        </p>
      )}

      {update && (
        <div className="flex flex-col gap-[6px]">
          <div className="label">{t("Actualización disponible")}</div>

          {update.changelog && <p className="text-sm">{update.changelog}</p>}

          {frozen.length > 0 && (
            <>
              <p className="text-sm opacity-70">
                {t("Esto no va a cambiar, porque lo editaste vos:")}
              </p>
              <ul className="text-sm opacity-70">
                {frozen.map((label) => (
                  <li key={label}>{label}</li>
                ))}
              </ul>
            </>
          )}

          <div>
            <Button
              type="button"
              className="primary"
              disabled={!isAdmin}
              disabledReason={t("Requiere permisos de administrador")}
              loading={takeVersion.isPending}
              onClick={() =>
                takeVersion.mutate({
                  agentId: agent.id,
                  version: update.version,
                })
              }
            >
              {t("Actualizar")}
            </Button>
          </div>
        </div>
      )}

      <label className="flex items-center justify-between">
        <span className="text-sm">{t("Actualizar automáticamente")}</span>
        <Switch
          checked={agent.template_auto_update}
          disabled={!isAdmin}
          aria-label={t("Actualizar automáticamente")}
          onCheckedChange={(checked) =>
            updateAgent.mutate({ id: agent.id, template_auto_update: checked })
          }
        />
      </label>

      {/* B3: the base instructions are readable, and only readable — what this
          organization writes lives in its own field, above. */}
      <label>
        <div className="label">{t("Instrucciones de la plantilla")}</div>
        <textarea
          className="text min-h-[96px] opacity-70"
          readOnly
          value={
            ((current?.config ?? {}) as AIAgentExtra).instructions ??
            t("Esta versión no trae instrucciones.")
          }
        />
      </label>

      {confirming ? (
        <div className="flex flex-col gap-[6px]">
          <p className="text-sm">
            {t(
              "El agente se queda con la configuración que tiene ahora y deja de recibir versiones nuevas.",
            )}
          </p>
          <div className="flex gap-[8px]">
            <Button
              type="button"
              loading={unlink.isPending}
              onClick={() => unlink.mutate(agent.id)}
            >
              {t("Desvincular de todos modos")}
            </Button>
            <Button type="button" onClick={() => setConfirming(false)}>
              {t("Cancelar")}
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <Button
            type="button"
            disabled={!isAdmin}
            disabledReason={t("Requiere permisos de administrador")}
            onClick={() => setConfirming(true)}
          >
            {t("Desvincular")}
          </Button>
        </div>
      )}
    </div>
  );
}
