import { Trash2 } from "lucide-react";
import Card from "@/components/ui/Card";
import DrillPanel from "@/components/ui/DrillPanel";
import Field from "@/components/ui/Field";
import { useTranslation } from "@/hooks/useTranslation";
import { type Control, type UseFormRegister, useWatch } from "react-hook-form";
import SelectField from "@/components/SelectField";
import type { ToolsForm } from "./types";
import CallHeaders from "./CallHeaders";

// HTTP Client Editor
export default function HTTPClientEditor({
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

  const isValid = label.trim() !== "";
  const isEmpty = label.trim() === "";

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
      title={label ? t("Editar cliente HTTP") : t("Agregar cliente HTTP")}
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
              placeholder={t("Mi cliente HTTP")}
              maxLength={32}
              {...register(`extra.tools.${index}.label`, {
                required: true,
                maxLength: 40,
              })}
            />
          )}
        </Field>

        <Field
          label={t("URL")}
          optional={t("opcional")}
          hint={t(
            "Si termina en /*, solo se permiten URLs que comiencen con esa base. De lo contrario, debe coincidir exactamente.",
          )}
        >
          {(field) => (
            <input
              {...field}
              type="url"
              className="text"
              placeholder="https://api.example.com/*"
              {...register(`extra.tools.${index}.config.url`)}
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

      <Card title={t("Qué puede hacer")}>
        <SelectField
          name={`extra.tools.${index}.config.methods`}
          control={control}
          label={t("Métodos")}
          multiple
          options={[
            { value: "GET", label: "GET" },
            { value: "POST", label: "POST" },
            { value: "PUT", label: "PUT" },
            { value: "PATCH", label: "PATCH" },
            { value: "DELETE", label: "DELETE" },
          ]}
        />
      </Card>

      <CallHeaders />
    </DrillPanel>
  );
}
