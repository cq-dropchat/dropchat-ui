import { Trash2 } from "lucide-react";
import Card from "@/components/ui/Card";
import DrillPanel from "@/components/ui/DrillPanel";
import Field from "@/components/ui/Field";
import { useTranslation } from "@/hooks/useTranslation";
import {
  type Control,
  type UseFormRegister,
  useWatch,
  type UseFormSetValue,
} from "react-hook-form";
import SelectField from "@/components/SelectField";
import type { SQLToolConfig } from "@/supabase/client";
import type { ToolsForm } from "./types";

// SQL Client Editor with driver-specific fields
export default function SQLClientEditor({
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

  const label =
    (useWatch({
      control,
      name: `extra.tools.${index}.label`,
    }) as string) || "";
  const driver =
    (useWatch({
      control,
      name: `extra.tools.${index}.config.driver`,
    }) as string) || "libsql";
  const url =
    (useWatch({
      control,
      name: `extra.tools.${index}.config.url`,
    }) as string) || "";
  const host =
    (useWatch({
      control,
      name: `extra.tools.${index}.config.host`,
    }) as string) || "";

  // Validation depends on driver
  const isLibSQL = driver === "libsql";
  const isValid =
    label.trim() !== "" && (isLibSQL ? url.trim() !== "" : host.trim() !== "");
  const isEmpty =
    label.trim() === "" && (isLibSQL ? url.trim() === "" : host.trim() === "");

  // Allow back if valid OR if unchanged (empty) - empty tools get deleted
  const canGoBack = isValid || isEmpty;

  const handleDriverChange = (newDriver: string) => {
    setValue(
      `extra.tools.${index}.config.driver`,
      newDriver as SQLToolConfig["driver"],
      { shouldDirty: true },
    );
  };

  const handleBack = () => {
    if (isEmpty) {
      onDelete(); // Delete empty tool
    } else {
      onBack();
    }
  };

  return (
    <DrillPanel
      title={label ? t("Editar cliente SQL") : t("Agregar cliente SQL")}
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
              placeholder={t("Mi base de datos")}
              maxLength={32}
              {...register(`extra.tools.${index}.label`, {
                required: true,
                maxLength: 40,
              })}
            />
          )}
        </Field>

        <SelectField
          label={t("Driver")}
          value={driver}
          onChange={handleDriverChange}
          options={[
            { value: "libsql", label: "LibSQL / Turso" },
            { value: "postgres", label: "PostgreSQL" },
            { value: "mysql", label: "MySQL" },
          ]}
        />
      </Card>

      {/* LibSQL-specific fields */}
      {isLibSQL && (
        <Card title={t("Base de datos")}>
          <Field label={t("URL")}>
            {(field) => (
              <input
                {...field}
                type="url"
                className="text"
                placeholder="libsql://your-database.turso.io"
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
                placeholder="eyJhbGciOiJFZ..."
                {...register(`extra.tools.${index}.config.token`)}
              />
            )}
          </Field>
        </Card>
      )}

      {/* Postgres/MySQL-specific fields */}
      {!isLibSQL && (
        <Card title={t("Base de datos")}>
          <Field label={t("Host")}>
            {(field) => (
              <input
                {...field}
                type="text"
                className="text"
                placeholder="localhost"
                {...register(`extra.tools.${index}.config.host`, {
                  required: true,
                })}
              />
            )}
          </Field>

          <Field label={t("Puerto")} optional={t("opcional")}>
            {(field) => (
              <input
                {...field}
                type="number"
                className="text font-mono tabular-nums"
                placeholder={driver === "postgres" ? "5432" : "3306"}
                {...register(`extra.tools.${index}.config.port`, {
                  valueAsNumber: true,
                })}
              />
            )}
          </Field>

          <Field label={t("Usuario")} optional={t("opcional")}>
            {(field) => (
              <input
                {...field}
                type="text"
                className="text"
                placeholder={driver === "postgres" ? "postgres" : "root"}
                {...register(`extra.tools.${index}.config.user`)}
              />
            )}
          </Field>

          <Field label={t("Contraseña")} optional={t("opcional")}>
            {(field) => (
              <input
                {...field}
                type="text"
                className="text"
                placeholder={t("Contraseña")}
                {...register(`extra.tools.${index}.config.password`)}
              />
            )}
          </Field>

          <Field label={t("Base de datos")} optional={t("opcional")}>
            {(field) => (
              <input
                {...field}
                type="text"
                className="text"
                placeholder="mydb"
                {...register(`extra.tools.${index}.config.database`)}
              />
            )}
          </Field>
        </Card>
      )}
    </DrillPanel>
  );
}
