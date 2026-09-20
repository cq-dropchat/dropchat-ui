import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import SectionBody from "@/components/SectionBody";
import SectionFooter from "@/components/SectionFooter";
import SectionHeader from "@/components/SectionHeader";
import Button from "@/components/Button";
import Switch from "@/components/Switch";
import { useTranslation } from "@/hooks/useTranslation";
import { useCurrentAgent } from "@/queries/useAgents";
import {
  useCurrentOrganization,
  useUpdateCurrentOrganization,
} from "@/queries/useOrganizations";
import type { AttentionConfig } from "@/supabase/client";
import {
  type BusinessHours,
  DAYS,
  type Day,
  fromForm,
  scheduleErrors,
  toForm,
  type Window,
} from "@/utils/businessHours";

export const Route = createFileRoute("/_auth/settings/organization/attention")({
  component: EditAttention,
});

/**
 * H6 — when the organization is reachable, and how long an assignment lasts.
 *
 * Everything here is read by something that acts on its own: the sweeps of
 * H4 decide when a customer has waited too long, and the takeover decides
 * whether answering by hand takes the conversation. So the screen states the
 * defaults rather than leaving fields empty — an admin should see what the
 * organization does today, not guess it.
 */
function EditAttention() {
  const { translate: t } = useTranslation();
  const { data: organization } = useCurrentOrganization();
  const { data: agent } = useCurrentAgent();
  const isAdmin = ["admin", "owner"].includes(agent?.role || "");
  const updateOrganization = useUpdateCurrentOrganization();

  const saved = organization?.extra?.attention;

  const [hours, setHours] = useState<BusinessHours | null>(null);
  const [config, setConfig] = useState<AttentionConfig | null>(null);

  // The saved row is the source until somebody edits: no `useEffect` sync,
  // no flicker when the query resolves.
  const week = hours ?? toForm(saved?.business_hours ?? null);
  const current: AttentionConfig = config ?? saved ?? {};
  const errors = useMemo(() => scheduleErrors(week), [week]);
  const hasErrors = Object.keys(errors).length > 0;
  const dirty = hours !== null || config !== null;

  const set = (patch: Partial<AttentionConfig>) =>
    setConfig({ ...current, ...patch });

  const setDay = (day: Day, windows: Window[]) =>
    setHours({ ...week, [day]: windows });

  const save = () =>
    updateOrganization.mutate(
      {
        id: organization?.id,
        extra: {
          ...organization?.extra,
          attention: { ...current, business_hours: fromForm(week) },
        },
      },
      {
        onSuccess: () => {
          setHours(null);
          setConfig(null);
        },
      },
    );

  return (
    <>
      <SectionHeader title={t("Atención")} />

      <SectionBody>
        <div className="flex flex-col gap-[16px]">
          <p className="text-muted-foreground text-[14px]">
            {t(
              "Sin horario, la organización se considera disponible a toda hora.",
            )}
          </p>

          <label>
            <div className="label">{t("Zona horaria")}</div>
            <input
              className="text"
              disabled={!isAdmin}
              value={current.timezone ?? "America/Santiago"}
              onChange={(event) => set({ timezone: event.target.value })}
            />
          </label>

          <div className="flex flex-col gap-[8px]" data-testid="schedule">
            <div className="label">{t("Horario semanal")}</div>

            {DAYS.map((day) => (
              <DayRow
                key={day}
                day={day}
                windows={week[day] ?? []}
                error={errors[day]}
                disabled={!isAdmin}
                onChange={(windows) => setDay(day, windows)}
              />
            ))}
          </div>

          <NumberField
            label={t("Vencimiento de la asignación de la IA (días)")}
            value={current.ai_assignment_ttl_days ?? 14}
            disabled={!isAdmin}
            onChange={(value) => set({ ai_assignment_ttl_days: value })}
          />

          <NumberField
            label={t("Vencimiento de la asignación humana (horas)")}
            description={t("0 = nunca vence")}
            value={current.human_assignment_ttl_hours ?? 72}
            disabled={!isAdmin}
            onChange={(value) => set({ human_assignment_ttl_hours: value })}
          />

          <NumberField
            label={t("Espera máxima por una persona (minutos hábiles)")}
            value={current.human_wait_minutes ?? 30}
            disabled={!isAdmin}
            onChange={(value) => set({ human_wait_minutes: value })}
          />

          <label>
            <div className="label">{t("Si nadie toma la conversación")}</div>
            <select
              className="text"
              disabled={!isAdmin}
              value={current.on_human_wait_timeout ?? "notify_customer"}
              onChange={(event) =>
                set({
                  on_human_wait_timeout: event.target
                    .value as AttentionConfig["on_human_wait_timeout"],
                })
              }
            >
              <option value="notify_customer">{t("Avisar al cliente")}</option>
              <option value="return_to_ai">{t("Devolver a la IA")}</option>
            </select>
          </label>

          <label>
            <div className="label">{t("Mensaje de espera")}</div>
            <textarea
              className="text"
              rows={2}
              disabled={!isAdmin}
              placeholder={t(
                "Nuestro equipo te responderá apenas esté disponible. Gracias por la espera.",
              )}
              value={current.human_wait_message ?? ""}
              onChange={(event) =>
                set({ human_wait_message: event.target.value })
              }
            />
          </label>

          <label className="flex items-center gap-[12px] cursor-pointer justify-between">
            <div className="flex flex-col gap-[2px]">
              <div className="text-foreground">{t("Toma implícita")}</div>
              <p className="text-muted-foreground text-[14px]">
                {t(
                  "Responder a mano una conversación de la IA se la entrega a quien responde",
                )}
              </p>
            </div>
            <Switch
              checked={current.auto_takeover ?? true}
              disabled={!isAdmin}
              onCheckedChange={(checked) => set({ auto_takeover: checked })}
            />
          </label>
        </div>
      </SectionBody>

      <SectionFooter>
        <Button
          type="button"
          onClick={save}
          disabled={!isAdmin}
          invalid={!dirty || hasErrors}
          loading={updateOrganization.isPending}
          disabledReason={t("Requiere permisos de administrador")}
          className="primary"
        >
          {t("Actualizar")}
        </Button>
      </SectionFooter>
    </>
  );
}

const DAY_NAMES: Record<Day, string> = {
  mon: "Lunes",
  tue: "Martes",
  wed: "Miércoles",
  thu: "Jueves",
  fri: "Viernes",
  sat: "Sábado",
  sun: "Domingo",
};

const ERRORS: Record<string, string> = {
  order: "La hora de cierre tiene que ser posterior a la de apertura",
  overlap: "Los tramos de un día no pueden superponerse",
  invalid: "Usá el formato HH:MM",
};

function DayRow({
  day,
  windows,
  error,
  disabled,
  onChange,
}: {
  day: Day;
  windows: Window[];
  error?: string;
  disabled?: boolean;
  onChange: (windows: Window[]) => void;
}) {
  const { translate: t } = useTranslation();

  return (
    <div className="flex flex-col gap-[4px]" data-testid={`day-${day}`}>
      <div className="flex items-center gap-[8px] flex-wrap">
        <div className="w-[90px] text-[14px] text-foreground">
          {t(DAY_NAMES[day])}
        </div>

        {windows.length === 0 && (
          <span className="text-muted-foreground text-[14px]">
            {t("Cerrado")}
          </span>
        )}

        {windows.map(([from, to], index) => (
          <div key={index} className="flex items-center gap-[4px]">
            <input
              className="text w-[90px]"
              aria-label={`${t(DAY_NAMES[day])} ${t("desde")}`}
              disabled={disabled}
              value={from}
              onChange={(event) =>
                onChange(
                  windows.map((window, i) =>
                    i === index ? [event.target.value, window[1]] : window,
                  ),
                )
              }
            />
            <span className="text-muted-foreground">–</span>
            <input
              className="text w-[90px]"
              aria-label={`${t(DAY_NAMES[day])} ${t("hasta")}`}
              disabled={disabled}
              value={to}
              onChange={(event) =>
                onChange(
                  windows.map((window, i) =>
                    i === index ? [window[0], event.target.value] : window,
                  ),
                )
              }
            />
            <button
              type="button"
              disabled={disabled}
              aria-label={`${t("Quitar tramo")} ${t(DAY_NAMES[day])}`}
              onClick={() => onChange(windows.filter((_, i) => i !== index))}
              className="p-[4px] text-muted-foreground hover:text-foreground"
            >
              <Trash2 className="w-[16px] h-[16px]" />
            </button>
          </div>
        ))}

        <button
          type="button"
          disabled={disabled}
          aria-label={`${t("Agregar tramo")} ${t(DAY_NAMES[day])}`}
          onClick={() => onChange([...windows, ["09:00", "19:00"]])}
          className="p-[4px] text-primary"
        >
          <Plus className="w-[16px] h-[16px]" />
        </button>
      </div>

      {error && (
        <div className="text-[13px] text-destructive" role="alert">
          {t(ERRORS[error])}
        </div>
      )}
    </div>
  );
}

function NumberField({
  label,
  description,
  value,
  disabled,
  onChange,
}: {
  label: string;
  description?: string;
  value: number;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label>
      <div className="label">{label}</div>
      <input
        type="number"
        className="text"
        min={0}
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      {description && (
        <p className="text-muted-foreground text-[13px]">{description}</p>
      )}
    </label>
  );
}
