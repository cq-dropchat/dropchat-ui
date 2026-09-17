import { createFileRoute, useNavigate } from "@tanstack/react-router";
import SectionHeader from "@/components/SectionHeader";
import SectionFooter from "@/components/SectionFooter";
import { useTranslation } from "@/hooks/useTranslation";
import { useCreateApiKey } from "@/queries/useApiKeys";
import { useCurrentAgent } from "@/queries/useAgents";
import { useForm } from "react-hook-form";
import SectionBody from "@/components/SectionBody";
import Button from "@/components/Button";
import type { ApiKeyInsert } from "@/supabase/client";
import SelectField from "@/components/SelectField";
import { type MintedApiKey } from "@/queries/useApiKeys";
import { useState } from "react";
import { Check, Copy } from "lucide-react";

export const Route = createFileRoute("/_auth/settings/api-keys/new")({
  component: AddApiKey,
});

function AddApiKey() {
  const { translate: t } = useTranslation();
  const navigate = useNavigate();
  const createApiKey = useCreateApiKey();
  const { data: currentAgent } = useCurrentAgent();
  const isOwner = currentAgent?.role === "owner";
  // F14: the secret is shown exactly once, here, right after minting.
  const [minted, setMinted] = useState<MintedApiKey | null>(null);
  const [copied, setCopied] = useState(false);

  function copyKey() {
    if (!minted) return;
    navigator.clipboard
      .writeText(minted.key)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(console.error);
  }

  const {
    register,
    handleSubmit,
    control,
    formState: { isValid, isDirty },
  } = useForm<ApiKeyInsert>({
    defaultValues: {
      role: "member",
    },
  });

  const roles = {
    owner: t("Propietario"),
    admin: t("Administrador"),
    member: t("Miembro"),
  };

  return (
    <>
      <SectionHeader title={t("Generar clave API")} />

      <SectionBody>
        <form
          id="create-apikey-form"
          onSubmit={handleSubmit((data) =>
            createApiKey.mutate(data, { onSuccess: setMinted }),
          )}
        >
          {minted && (
            <div className="instructions">
              <p>
                {t(
                  "Copiá la clave ahora: no se vuelve a mostrar. Solo se guarda su prefijo.",
                )}
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  className="text font-mono"
                  readOnly
                  value={minted.key}
                />
                <button
                  type="button"
                  className="p-[8px] hover:bg-muted rounded-full shrink-0"
                  title={t("Copiar clave")}
                  onClick={copyKey}
                >
                  {copied ? (
                    <Check className="w-[20px] h-[20px] text-primary" />
                  ) : (
                    <Copy className="w-[20px] h-[20px] text-muted-foreground" />
                  )}
                </button>
              </div>
            </div>
          )}

          <fieldset disabled={!isOwner || !!minted} className="contents">
            <p className="text-muted-foreground text-[14px]">
              {t(
                "Esto generará una nueva clave API que podrás usar para autenticarte.",
              )}
            </p>

            <label>
              <div className="label">{t("Nombre")}</div>
              <input
                className="text"
                placeholder={t("Nombre de la clave")}
                {...register("name", { required: true })}
              />
            </label>

            <SelectField
              name="role"
              control={control}
              label={t("Rol")}
              options={[
                { value: "member", label: roles.member },
                { value: "admin", label: roles.admin },
                { value: "owner", label: roles.owner },
              ]}
              required
            />
          </fieldset>
        </form>
      </SectionBody>

      <SectionFooter>
        {minted ? (
          <Button
            type="button"
            className="primary"
            onClick={() =>
              navigate({
                to: `/settings/api-keys/${minted.id}`,
                hash: (prevHash) => prevHash!,
              })
            }
          >
            {t("Listo")}
          </Button>
        ) : (
          <Button
            form="create-apikey-form"
            type="submit"
            disabled={!isOwner}
            invalid={!isValid || !isDirty}
            loading={createApiKey.isPending}
            disabledReason={t("Requiere permisos de propietario")}
            className="primary"
          >
            {t("Generar")}
          </Button>
        )}
      </SectionFooter>
    </>
  );
}
