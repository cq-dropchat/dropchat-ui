import { createFileRoute, useNavigate } from "@tanstack/react-router";
import SectionHeader from "@/components/SectionHeader";
import { useTranslation } from "@/hooks/useTranslation";
import { useApiKey, useDeleteApiKey } from "@/queries/useApiKeys";
import { useCurrentAgent } from "@/queries/useAgents";
import { useForm } from "react-hook-form";
import SectionBody from "@/components/SectionBody";
import type { ApiKeyUpdate } from "@/supabase/client";

export const Route = createFileRoute("/_auth/settings/api-keys/$apiKeyId")({
  component: ApiKeyDetail,
});

function ApiKeyDetail() {
  const { translate: t } = useTranslation();
  const navigate = useNavigate();
  const { apiKeyId } = Route.useParams();
  const { data: apiKey } = useApiKey(apiKeyId);
  const { data: currentAgent } = useCurrentAgent();
  const isOwner = currentAgent?.role === "owner";
  const deleteApiKey = useDeleteApiKey();

  const { register } = useForm<ApiKeyUpdate>({
    values: apiKey,
  });

  return (
    apiKey && (
      <>
        <SectionHeader
          title={t("Clave API")}
          onDelete={() =>
            deleteApiKey.mutate(apiKeyId, {
              onSuccess: () =>
                navigate({ to: "..", hash: (prevHash) => prevHash! }),
            })
          }
          deleteDisabled={!isOwner}
          deleteDisabledReason={t("Requiere permisos de propietario")}
          deleteLoading={deleteApiKey.isPending}
        />

        <SectionBody>
          <form>
            <div className="instructions">
              <p>
                {t(
                  "Configura los siguientes encabezados HTTP para autenticarte:",
                )}
              </p>
              <ul>
                <li>
                  <code className="font-mono">authorization:</code>{" "}
                  <code className="font-mono break-all">
                    {import.meta.env.VITE_SUPABASE_ANON_KEY}
                  </code>
                </li>
                <li>
                  <code className="font-mono">api-key:</code>{" "}
                  {t("la clave que se mostró al generarla")}
                </li>
              </ul>
            </div>

            <label>
              <div className="label">{t("Nombre")}</div>
              <input
                type="text"
                className="text"
                readOnly
                {...register("name")}
              />
            </label>

            <label>
              <div className="label">{t("Rol")}</div>
              <div className="text-[16px] text-foreground">
                {apiKey.role === "owner" && t("Propietario")}
                {apiKey.role === "admin" && t("Administrador")}
                {apiKey.role === "member" && t("Miembro")}
              </div>
            </label>

            <label>
              <div className="label">{t("Clave")}</div>
              <div className="text-[16px] text-foreground font-mono">
                {apiKey.key_prefix}…
              </div>
              <p className="text-muted-foreground text-[13px] mt-1">
                {t(
                  "Solo se guarda el prefijo. Si perdiste la clave, generá una nueva y eliminá esta.",
                )}
              </p>
            </label>

            {apiKey.last_used_at && (
              <label>
                <div className="label">{t("Último uso")}</div>
                <div className="text-[16px] text-foreground">
                  {new Date(apiKey.last_used_at).toLocaleString()}
                </div>
              </label>
            )}
          </form>
        </SectionBody>
      </>
    )
  );
}
