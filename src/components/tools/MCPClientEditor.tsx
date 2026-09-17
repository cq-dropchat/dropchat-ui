import { ArrowLeft, Trash2 } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { type Control, type UseFormRegister, useWatch } from "react-hook-form";
import SectionBody from "@/components/SectionBody";
import type { ToolsForm } from "./types";

// MCP Client Editor
export default function MCPClientEditor({
  index,
  register,
  control,
  onDelete,
  onBack,
}: {
  index: number;
  register: UseFormRegister<ToolsForm>;
  control: Control<ToolsForm>;
  onDelete: () => void;
  onBack: () => void;
}) {
  const { translate: t } = useTranslation();

  const label =
    (useWatch({
      control,
      name: `extra.tools.${index}.label`,
    }) as string) || "";
  const url =
    (useWatch({
      control,
      name: `extra.tools.${index}.config.url`,
    }) as string) || "";

  const isValid = label.trim() !== "" && url.trim() !== "";
  const isEmpty = label.trim() === "" && url.trim() === "";

  // Allow back if valid OR if unchanged (empty) - empty tools get deleted
  const canGoBack = isValid || isEmpty;

  const handleBack = () => {
    if (isEmpty) {
      onDelete(); // Delete empty tool
    } else {
      onBack();
    }
  };

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
          {label ? t("Editar cliente MCP") : t("Agregar cliente MCP")}
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
            placeholder={t("Mi cliente MCP")}
            maxLength={32}
            {...register(`extra.tools.${index}.label`, {
              required: true,
              maxLength: 40,
            })}
          />
        </label>

        <label>
          <div className="label">{t("URL")}</div>
          <input
            type="url"
            className="text"
            placeholder="https://mcp.example.com/sse"
            {...register(`extra.tools.${index}.config.url`, {
              required: true,
            })}
          />
        </label>

        <label>
          <div className="label">
            {t("Token")} ({t("opcional")})
          </div>
          <input
            type="text"
            className="text"
            placeholder="Bearer sk-..."
            {...register(`extra.tools.${index}.config.headers.authorization`)}
          />
        </label>

        <div className="instructions">
          <p>
            {t("Se envían los siguientes encabezados HTTP con cada solicitud:")}
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
      </SectionBody>
    </div>
  );
}
