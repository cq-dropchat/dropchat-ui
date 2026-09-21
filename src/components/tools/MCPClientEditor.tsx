import { Trash2 } from "lucide-react";
import Card from "@/components/ui/Card";
import DrillPanel from "@/components/ui/DrillPanel";
import Field from "@/components/ui/Field";
import { useTranslation } from "@/hooks/useTranslation";
import { type Control, type UseFormRegister, useWatch } from "react-hook-form";
import type { ToolsForm } from "./types";
import CallHeaders from "./CallHeaders";

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
    <DrillPanel
      title={label ? t("Editar cliente MCP") : t("Agregar cliente MCP")}
      onBack={handleBack}
      backDisabledReason={
        canGoBack ? undefined : t("Completa los campos requeridos")
      }
      action={
        <button
          type="button"
          className="hover:bg-muted flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-full"
          title={t("Eliminar")}
          aria-label={t("Eliminar")}
          onClick={onDelete}
        >
          <Trash2 className="h-[20px] w-[20px]" aria-hidden />
        </button>
      }
    >
      <Card title={t("Conexión")}>
        <Field
          label={t("Nombre")}
          hint={t("Cómo lo ves en la lista de herramientas del agente.")}
        >
          {(field) => (
            <input
              {...field}
              type="text"
              className="text"
              placeholder={t("Mi cliente MCP")}
              maxLength={32}
              {...register(`extra.tools.${index}.label`, {
                required: true,
                maxLength: 40,
              })}
            />
          )}
        </Field>

        <Field label={t("URL")}>
          {(field) => (
            <input
              {...field}
              type="url"
              className="text"
              placeholder="https://mcp.example.com/sse"
              {...register(`extra.tools.${index}.config.url`, {
                required: true,
              })}
            />
          )}
        </Field>

        <Field label={t("Token")} optional={t("opcional")}>
          {(field) => (
            <input
              {...field}
              type="text"
              className="text"
              placeholder="Bearer sk-..."
              {...register(`extra.tools.${index}.config.headers.authorization`)}
            />
          )}
        </Field>
      </Card>

      <CallHeaders />
    </DrillPanel>
  );
}
