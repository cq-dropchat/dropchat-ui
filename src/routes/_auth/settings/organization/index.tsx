import SectionBody from "@/components/SectionBody";
import SectionHeader from "@/components/SectionHeader";
import SectionFooter from "@/components/SectionFooter";
import { useTranslation } from "@/hooks/useTranslation";
import {
  useCurrentOrganization,
  useUpdateCurrentOrganization,
  useDeleteCurrentOrganization,
} from "@/queries/useOrganizations";
import { useCurrentAgent } from "@/queries/useAgents";
import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { useMemo } from "react";
import useBoundStore from "@/stores/useBoundStore";
import Button from "@/components/Button";
import SelectField from "@/components/SelectField";
import TextAreaField from "@/components/TextAreaField";
import BusinessProfileFields from "@/components/BusinessProfileFields";
import { type OrganizationUpdate } from "@/supabase/client";
import {
  isExportInProgress,
  useOrganizationExport,
  useRequestOrganizationExport,
  useSignOrganizationExport,
} from "@/queries/useOrganizationExports";

export const Route = createFileRoute("/_auth/settings/organization/")({
  beforeLoad: () => {
    const activeOrgId = useBoundStore.getState().ui.activeOrgId;
    if (!activeOrgId) {
      throw redirect({
        to: "/settings/organization/new",
      });
    }
  },
  component: EditOrganization,
});

function EditOrganization() {
  const { translate: t } = useTranslation();
  const navigate = useNavigate();
  const { data: org } = useCurrentOrganization();
  const { data: agent } = useCurrentAgent();
  // Admins run the organization — the whole row, name included. Deleting it is
  // the owner's, like every other way of taking control.
  const isAdmin = ["admin", "owner"].includes(agent?.role || "");
  const isOwner = agent?.role === "owner";
  const setActiveOrg = useBoundStore((state) => state.ui.setActiveOrg);
  const updateOrg = useUpdateCurrentOrganization();
  const deleteOrg = useDeleteCurrentOrganization();

  const normalizedOrg = useMemo(() => {
    if (!org) return undefined;
    return {
      ...org,
      extra: {
        ...org.extra,
        error_messages_direction:
          org.extra?.error_messages_direction || "internal",
        // T1: the market is Chile (§21). Defaulted here rather than asked for,
        // because a selector with one option is a question with one answer —
        // and without it the agent never learns what the prices are in.
        business_profile: {
          currency: "CLP" as const,
          ...org.extra?.business_profile,
        },
      },
    };
  }, [org]);

  const {
    register,
    handleSubmit,
    control,
    formState: { isValid, isDirty },
  } = useForm<OrganizationUpdate>({ values: normalizedOrg });

  return (
    <>
      <SectionHeader
        title={t("Editar organización")}
        onDelete={() =>
          deleteOrg.mutate(undefined, {
            onSuccess: () => {
              setActiveOrg(null);
              void navigate({ to: "/conversations" });
            },
          })
        }
        deleteDisabled={!isOwner}
        deleteDisabledReason={t("Requiere permisos de propietario")}
        deleteLoading={deleteOrg.isPending}
      />

      <SectionBody>
        <form
          id="org-form"
          onSubmit={handleSubmit((data) => updateOrg.mutate(data))}
        >
          <label>
            <div className="label">{t("Nombre")}</div>
            <input
              className="text"
              placeholder={t("Nombre de la organización")}
              disabled={!isAdmin}
              {...register("name", { required: true })}
            />
          </label>

          {/* H2: one voice of the brand. It leads the system prompt of every
              agent of the organization, ahead of the agent's own
              instructions. */}
          <TextAreaField
            plain
            name="extra.brand_voice"
            control={control}
            label={t("Voz de marca")}
            placeholder={t(
              "Tutea al cliente, sé breve y cálido, firma como «el equipo».",
            )}
            disabled={!isAdmin}
          />

          {/* T1: what the business sells, ships and charges. Slot 2 of the
              system prompt, right after the voice it is said in. */}
          <BusinessProfileFields
            register={register}
            control={control}
            disabled={!isAdmin}
          />

          <SelectField
            control={control}
            name="extra.error_messages_direction"
            label={t("Mensajes de error")}
            options={[
              { value: "internal", label: t("Solo en la UI") },
              { value: "outgoing", label: t("Visible desde WhatsApp") },
            ]}
            disabled={!isAdmin}
          />
        </form>

        {isOwner && <OrganizationExport />}
      </SectionBody>

      <SectionFooter>
        <Button
          form="org-form"
          type="submit"
          disabled={!isAdmin}
          invalid={!isValid || !isDirty}
          loading={updateOrg.isPending}
          disabledReason={t("Requiere permisos de administrador")}
          className="primary"
        >
          {t("Actualizar")}
        </Button>
      </SectionFooter>
    </>
  );
}

/**
 * F18: a copy of the organization's data, as a ZIP of one NDJSON per table.
 * The owner's alone — `request_organization_export` answers 42501 to anyone
 * else, so the whole block is theirs to see. Building it is a cron worker's
 * job, so the row is polled while it runs and left alone once it is not.
 */
function OrganizationExport() {
  const { translate: t } = useTranslation();
  const { data: exportRow } = useOrganizationExport();
  const request = useRequestOrganizationExport();
  const sign = useSignOrganizationExport();

  const working = isExportInProgress(exportRow?.status) || request.isPending;
  const expiresAt = exportRow?.expires_at
    ? new Date(exportRow.expires_at)
    : null;

  return (
    <div className="flex flex-col gap-[8px] pt-[10px]">
      <div className="label">{t("Exportar datos")}</div>

      <p className="text-sm opacity-70">
        {t(
          "Un ZIP con los mensajes, conversaciones, contactos y cuentas de la organización. No incluye credenciales ni archivos adjuntos.",
        )}
      </p>

      {working && <p className="text-sm">{t("Preparando…")}</p>}

      {exportRow?.status === "ready" && expiresAt && (
        <p className="text-sm">
          {t("Disponible hasta")} {expiresAt.toLocaleDateString()}
        </p>
      )}

      {exportRow?.status === "expired" && (
        <p className="text-sm opacity-70">{t("El archivo ya venció")}</p>
      )}

      {exportRow?.status === "failed" && (
        <p role="alert" className="text-sm text-red-600">
          {t("No se pudo preparar la exportación")}
          {exportRow.error ? `: ${exportRow.error}` : null}
        </p>
      )}

      <div className="flex gap-[8px]">
        <Button
          type="button"
          className="primary"
          loading={request.isPending}
          disabled={working}
          onClick={() => request.mutate()}
        >
          {t("Exportar datos")}
        </Button>

        {exportRow?.status === "ready" && exportRow.object_name && (
          <Button
            type="button"
            loading={sign.isPending}
            onClick={() =>
              sign.mutate(exportRow.object_name!, {
                // A signed URL is good for an hour and names the file; opening
                // it is the download. Nothing is stored on this side.
                onSuccess: (url) => window.open(url, "_blank", "noopener"),
              })
            }
          >
            {t("Descargar")}
          </Button>
        )}
      </div>
    </div>
  );
}
