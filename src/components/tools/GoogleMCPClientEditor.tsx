import { useRef } from "react";
import { ArrowLeft, Check, FileSpreadsheet, Trash2 } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import {
  type Control,
  type UseFormRegister,
  useWatch,
  type UseFormSetValue,
} from "react-hook-form";
import SectionBody from "@/components/SectionBody";
import SelectField from "@/components/SelectField";
import type { LocalMCPToolConfig, ToolConfig } from "@/supabase/client";
import type { OAuthCallbackMessage } from "@/routes/oauth/callback";
import type { ToolsForm } from "./types";

// Google MCP Client Editor
export default function GoogleMCPClientEditor({
  index,
  register,
  control,
  setValue,
  updateTool,
  onDelete,
  onBack,
}: {
  index: number;
  register: UseFormRegister<ToolsForm>;
  control: Control<ToolsForm>;
  setValue: UseFormSetValue<ToolsForm>;
  updateTool: (index: number, data: ToolConfig) => void;
  onDelete: () => void;
  onBack: () => void;
}) {
  const { translate: t } = useTranslation();

  const product = useWatch({
    control,
    name: `extra.tools.${index}.config.product`,
  }) as string;
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
  const email =
    (useWatch({
      control,
      name: `extra.tools.${index}.config.email`,
    }) as string) || "";
  const files =
    (useWatch({
      control,
      name: `extra.tools.${index}.config.files`,
    }) as string[]) || [];
  const allowedTools =
    (useWatch({
      control,
      name: `extra.tools.${index}.config.allowed_tools`,
    }) as string[]) || [];

  // Keep a ref with fresh values that the callback can access
  const currentValuesRef = useRef({
    label,
    token,
    email,
    files,
    allowedTools,
    product,
  });
  currentValuesRef.current = {
    label,
    token,
    email,
    files,
    allowedTools,
    product,
  };

  const isValid = label.trim() !== "" && token.trim() !== "";
  const isEmpty = label.trim() === "" && token.trim() === "";

  // Allow back if valid OR if unchanged (empty) - empty tools get deleted
  const canGoBack = isValid || isEmpty;

  const handleBack = () => {
    if (isEmpty) {
      onDelete(); // Delete empty tool
    } else {
      onBack();
    }
  };

  const handleGetToken = () => {
    // Open popup
    // https://g.mcp.openbsp.dev/auth/google?products=calendar,sheets&callback=YOUR_CALLBACK_URL
    const callbackUrl = window.location.origin + "/oauth/callback";
    const authUrl = `https://g.mcp.openbsp.dev/auth/google?products=${product}&callback=${encodeURIComponent(callbackUrl)}`;

    // Calculate center position
    const width = 600;
    const height = 700;
    const left = window.screen.width / 2 - width / 2;
    const top = window.screen.height / 2 - height / 2;

    window.open(
      authUrl,
      "google_auth_popup",
      `width=${width},height=${height},top=${top},left=${left}`,
    );

    // Listen for message
    const handleMessage = (event: MessageEvent<OAuthCallbackMessage>) => {
      if (event.origin !== window.location.origin) return;

      if (event.data?.type === "oauth-callback" && event.data.apiKey) {
        // Build tool from fresh ref values (not stale closure data)
        const {
          label: freshLabel,
          email: freshEmail,
          files: freshFiles,
          allowedTools: freshAllowedTools,
          product: freshProduct,
        } = currentValuesRef.current;
        const newToken = `Bearer ${event.data.apiKey}`;
        const updatedTool: LocalMCPToolConfig = {
          provider: "local",
          type: "mcp",
          label: freshLabel,
          config: {
            url: event.data.url || "https://g.mcp.openbsp.dev/mcp",
            product: freshProduct as "calendar" | "sheets",
            allowed_tools: freshAllowedTools,
            email: event.data.email || freshEmail || undefined,
            files: event.data?.files
              ? typeof event.data.files === "string"
                ? event.data.files.split(",")
                : []
              : freshFiles,
            headers: {
              authorization: newToken,
            },
          },
        };
        updateTool(index, updatedTool);

        // Explicitly set the token field to force dirty state
        setValue(
          `extra.tools.${index}.config.headers.authorization`,
          newToken,
          { shouldDirty: true, shouldValidate: true, shouldTouch: true },
        );

        // Remove listener
        window.removeEventListener("message", handleMessage);
      }
    };

    window.addEventListener("message", handleMessage);
  };

  const allowedToolsOptions =
    product === "calendar"
      ? [
          { value: "list_calendars", label: t("Listar calendarios") },
          { value: "list_events", label: t("Listar eventos") },
          { value: "check_availability", label: t("Verificar disponibilidad") },
          { value: "create_event", label: t("Crear evento") },
          { value: "update_event", label: t("Actualizar evento") },
          { value: "delete_event", label: t("Eliminar evento") },
        ]
      : [
          {
            value: "list_authorized_files",
            label: t("Listar archivos autorizados"),
          },
          { value: "get_spreadsheet", label: t("Obtener hoja de cálculo") },
          { value: "get_sheet_schema", label: t("Obtener esquema de la hoja") },
          { value: "describe_sheet", label: t("Describir hoja") },
          { value: "search_rows", label: t("Buscar filas") },
          { value: "read_sheet", label: t("Leer hoja") },
          { value: "write_sheet", label: t("Escribir hoja") },
          { value: "append_rows", label: t("Agregar filas") },
          { value: "create_spreadsheet", label: t("Crear hoja de cálculo") },
          { value: "semantic_search", label: t("Búsqueda semántica") },
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
        <div className="text-[16px]">
          {product === "calendar" ? t("Google Calendar") : t("Google Sheets")}
        </div>

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
            placeholder={
              product === "calendar"
                ? t("Mi calendario")
                : t("Mi hoja de cálculo")
            }
            maxLength={32}
            {...register(`extra.tools.${index}.label`, {
              required: true,
              maxLength: 40,
            })}
          />
        </label>

        <p>
          {t(
            "Autoriza el acceso a tu cuenta de Google para que el agente pueda interactuar con",
          )}{" "}
          {product === "calendar"
            ? t("tu calendario")
            : t("tus hojas de cálculo")}
          .
        </p>

        <button
          type="button"
          className="bg-secondary text-secondary-foreground hover:bg-secondary/80 px-4 py-2 rounded-full font-medium transition-colors w-fit text-[14px] flex items-center gap-2"
          onClick={handleGetToken}
        >
          {token && <Check className="w-4 h-4" />}
          {token ? email || t("Autorizado") : t("Autorizar")}
        </button>

        {/* Hidden input to register field for setValue to work */}
        <input
          type="hidden"
          {...register(`extra.tools.${index}.config.headers.authorization`, {
            required: true,
          })}
        />

        {product === "sheets" && files.length > 0 && (
          <div>
            <div className="label mb-2">{t("Archivos compartidos")}</div>
            <div className="flex flex-wrap gap-2">
              {files.map((file, i) => (
                <div
                  key={i}
                  className="bg-muted px-3 py-1 rounded-full text-sm text-foreground flex items-center gap-2"
                >
                  <FileSpreadsheet className="w-4 h-4 text-muted-foreground" />
                  {file}
                </div>
              ))}
            </div>
          </div>
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
