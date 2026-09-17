import { ArrowLeft, Trash2 } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import {
  type Control,
  type UseFormRegister,
  useWatch,
  type UseFormSetValue,
} from "react-hook-form";
import SectionBody from "@/components/SectionBody";
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
          {label ? t("Editar cliente SQL") : t("Agregar cliente SQL")}
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
            placeholder={t("Mi base de datos")}
            maxLength={32}
            {...register(`extra.tools.${index}.label`, {
              required: true,
              maxLength: 40,
            })}
          />
        </label>

        <SelectField
          label={t("Driver")}
          value={driver}
          onChange={handleDriverChange}
          options={[
            { value: "libsql", label: "LibSQL / Turso" },
            { value: "postgres", label: "PostgreSQL" },
            { value: "mysql", label: "MySQL" },
          ]}
          modalClassName="bottom-0"
        />

        {/* LibSQL-specific fields */}
        {isLibSQL && (
          <>
            <label>
              <div className="label">{t("URL")}</div>
              <input
                type="url"
                className="text"
                placeholder="libsql://your-database.turso.io"
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
                placeholder="eyJhbGciOiJFZ..."
                {...register(`extra.tools.${index}.config.token`)}
              />
            </label>
          </>
        )}

        {/* Postgres/MySQL-specific fields */}
        {!isLibSQL && (
          <>
            <label>
              <div className="label">{t("Host")}</div>
              <input
                type="text"
                className="text"
                placeholder="localhost"
                {...register(`extra.tools.${index}.config.host`, {
                  required: true,
                })}
              />
            </label>

            <label>
              <div className="label">
                {t("Puerto")} ({t("opcional")})
              </div>
              <input
                type="number"
                className="text"
                placeholder={driver === "postgres" ? "5432" : "3306"}
                {...register(`extra.tools.${index}.config.port`, {
                  valueAsNumber: true,
                })}
              />
            </label>

            <label>
              <div className="label">
                {t("Usuario")} ({t("opcional")})
              </div>
              <input
                type="text"
                className="text"
                placeholder={driver === "postgres" ? "postgres" : "root"}
                {...register(`extra.tools.${index}.config.user`)}
              />
            </label>

            <label>
              <div className="label">
                {t("Contraseña")} ({t("opcional")})
              </div>
              <input
                type="text"
                className="text"
                placeholder={t("Contraseña")}
                {...register(`extra.tools.${index}.config.password`)}
              />
            </label>

            <label>
              <div className="label">
                {t("Base de datos")} ({t("opcional")})
              </div>
              <input
                type="text"
                className="text"
                placeholder="mydb"
                {...register(`extra.tools.${index}.config.database`)}
              />
            </label>
          </>
        )}
      </SectionBody>
    </div>
  );
}
