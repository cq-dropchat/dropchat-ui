import { useState, useEffect } from "react";
import { ArrowLeft, Check, Trash2 } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import {
  type Control,
  type UseFormRegister,
  useWatch,
  type UseFormSetValue,
} from "react-hook-form";
import SectionBody from "@/components/SectionBody";
import SelectField from "@/components/SelectField";
import { useCurrentAgent } from "@/queries/useAgents";
import { useCreateApiKey } from "@/queries/useApiKeys";
import type { ToolsForm } from "./types";

// OpenBSP MCP Client Editor
export default function OpenBSPMCPClientEditor({
  index,
  register,
  control,
  setValue,
  onDelete,
  onBack,
}: {
  index: number;
  register: UseFormRegister<ToolsForm>;
  control: Control<ToolsForm>;
  setValue: UseFormSetValue<ToolsForm>;
  onDelete: () => void;
  onBack: () => void;
}) {
  const { translate: t } = useTranslation();

  const { data: currentAgent } = useCurrentAgent();
  const isOwner = currentAgent?.role === "owner";

  const { mutateAsync: createApiKey } = useCreateApiKey();
  const [autoAuthDone, setAutoAuthDone] = useState(false);

  const label =
    (useWatch({
      control,
      name: `extra.tools.${index}.label`,
    }) as string) || "";
  const token =
    (useWatch({
      control,
      name: `extra.tools.${index}.config.headers.authorization`,
    }) as string) || "";

  // Auto-auth for owners: mint an "OpenBSP MCP" API key for this tool.
  //
  // P8: it used to look for an existing key by that name and reuse it. Since
  // F14 a stored key has no secret to reuse — `key` read back null, and the
  // header was filled with "Bearer null" — and P8 removed the column
  // altogether. A key exists in the clear exactly once, in the reply to
  // create_api_key, so the only way to fill this header is to mint one.
  const hasToken = token.trim() !== "";
  useEffect(() => {
    if (!isOwner || autoAuthDone || hasToken) return;

    void createApiKey({ name: "OpenBSP MCP", role: "member" }).then(
      (newKey) => {
        if (newKey) {
          setValue(
            `extra.tools.${index}.config.headers.authorization`,
            `Bearer ${newKey.key}`,
            { shouldDirty: true },
          );
        }
        setAutoAuthDone(true);
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwner, autoAuthDone, hasToken]);

  const isValid = label.trim() !== "" && hasToken;
  const isEmpty = label.trim() === "" && !hasToken;
  const canGoBack = isValid || isEmpty;

  const handleBack = () => {
    if (isEmpty) {
      onDelete();
    } else {
      onBack();
    }
  };

  const allowedToolsOptions = [
    { value: "list_conversations", label: t("Listar conversaciones") },
    { value: "fetch_conversation", label: t("Obtener conversación") },
    { value: "search_contacts", label: t("Buscar contactos") },
    { value: "list_accounts", label: t("Listar cuentas") },
    { value: "send_message", label: t("Enviar mensaje") },
    { value: "list_templates", label: t("Listar plantillas") },
    { value: "fetch_template", label: t("Obtener plantilla") },
  ];

  return (
    <div className="absolute inset-0 bottom-[80px] z-50 bg-background flex flex-col">
      <div className="header items-center truncate shrink-0">
        <button
          type="button"
          className="p-[8px] rounded-full hover:bg-muted mr-[8px] ml-[-8px] disabled:opacity-30 disabled:hover:bg-transparent"
          title={
            canGoBack
              ? t("Volver")
              : t("Volver") + " - " + t("Completa los campos requeridos")
          }
          onClick={handleBack}
          disabled={!canGoBack}
        >
          <ArrowLeft className="w-[24px] h-[24px]" />
        </button>
        <div className="text-[16px]">WhatsApp</div>

        <button
          type="button"
          className="p-[8px] rounded-full hover:bg-muted ml-auto"
          title={t("Eliminar")}
          onClick={onDelete}
        >
          <Trash2 className="w-[24px] h-[24px]" />
        </button>
      </div>

      <SectionBody className="gap-[24px] pl-[10px]">
        <label>
          <div className="label">{t("Nombre")}</div>
          <input
            type="text"
            className="text"
            placeholder="Mis chats"
            maxLength={32}
            {...register(`extra.tools.${index}.label`, {
              required: true,
              maxLength: 32,
            })}
          />
        </label>

        {isOwner ? (
          <div className="flex items-center gap-[8px] text-[14px]">
            {hasToken ? (
              <>
                <Check className="w-[16px] h-[16px] text-primary" />
                <span className="text-muted-foreground">
                  {t("Autenticación configurada automáticamente")}
                </span>
              </>
            ) : (
              <span className="text-muted-foreground">
                {t("Configurando autenticación...")}
              </span>
            )}
          </div>
        ) : (
          <label>
            <div className="label">{t("Token")}</div>
            <input
              type="text"
              className="text"
              placeholder="Bearer sk_..."
              {...register(
                `extra.tools.${index}.config.headers.authorization`,
                { required: true },
              )}
            />
            <p className="text-muted-foreground text-[14px] mt-[4px]">
              {t("Obtén una API key en Configuración > API Keys")}
            </p>
          </label>
        )}

        {/* Hidden input for owner auth */}
        {isOwner && (
          <input
            type="hidden"
            {...register(`extra.tools.${index}.config.headers.authorization`, {
              required: true,
            })}
          />
        )}

        <SelectField
          name={`extra.tools.${index}.config.allowed_tools`}
          control={control}
          label={t("Herramientas permitidas")}
          multiple
          options={allowedToolsOptions}
          placeholder={t("Ninguna")}
          modalClassName="bottom-0"
        />
      </SectionBody>
    </div>
  );
}
