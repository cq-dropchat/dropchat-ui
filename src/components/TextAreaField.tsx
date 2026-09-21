import { useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { fill } from "@/i18n/translations";
import {
  Controller,
  type Control,
  type FieldValues,
  type Path,
} from "react-hook-form";
import type { ReactNode } from "react";
import DrillPanel from "@/components/ui/DrillPanel";
import DrillRow, { RowPreview } from "@/components/ui/DrillRow";

interface TextAreaFieldProps<T extends FieldValues> {
  name: Path<T>;
  control: Control<T>;
  label: string;
  /** The name of the thing being edited, carried into the sub-panel. */
  owner?: string;
  /** What the label cannot say in three words, shown above the box. */
  hint?: string;
  /** A chip beside the row's name. */
  badge?: ReactNode;
  placeholder?: string;
  /** For text a machine reads back: instructions, mostly. */
  mono?: boolean;
  /** The boxed trigger, for a form that is not made of cards. */
  plain?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  last?: boolean;
}

/**
 * A long text, edited in a panel of its own.
 *
 * What changed is the row you press to get there: it used to be a box
 * pretending to be an input, whose second line said «Ninguna» or «412
 * caracteres». Neither tells you what the agent is going to say. The row now
 * shows the beginning of the text itself, which is the only summary of a
 * prompt worth having.
 */
export default function TextAreaField<T extends FieldValues>({
  name,
  control,
  label,
  owner,
  hint,
  badge,
  placeholder,
  mono,
  plain,
  disabled,
  disabledReason,
  last,
}: TextAreaFieldProps<T>) {
  const { translate: t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Controller
      name={name}
      control={control}
      render={({ field }) => {
        const value = (field.value as string | null | undefined) || "";
        const preview = value.trim().split("\n")[0];

        return (
          <>
            <DrillRow
              label={label}
              badge={badge}
              plain={plain}
              onClick={() => setIsOpen(true)}
              disabled={disabled}
              disabledReason={disabledReason}
              last={last}
            >
              {preview ? (
                <>
                  <RowPreview mono={mono}>{preview}</RowPreview>
                  <span className="text-muted-foreground font-mono text-[11px] tabular-nums">
                    {fill(t("{n} caracteres"), { n: value.length })}
                  </span>
                </>
              ) : (
                <RowPreview>{placeholder || t("Sin escribir")}</RowPreview>
              )}
            </DrillRow>

            {isOpen && (
              <DrillPanel
                title={label}
                subtitle={owner}
                onBack={() => setIsOpen(false)}
                footer={
                  <>
                    <span className="hint">
                      {t("Se guarda cuando guardes el agente.")}
                    </span>
                    <button
                      type="button"
                      className="primary"
                      onClick={() => setIsOpen(false)}
                    >
                      {t("Listo")}
                    </button>
                  </>
                }
              >
                {hint && <span className="hint">{hint}</span>}

                <label htmlFor={`${name}-drill`} className="sr-only">
                  {label}
                </label>
                <textarea
                  id={`${name}-drill`}
                  className={`text grow ${mono ? "font-mono text-[14px] leading-[1.6]" : ""}`}
                  value={value}
                  onChange={(event) => field.onChange(event.target.value)}
                  placeholder={placeholder}
                  disabled={disabled}
                  autoFocus
                />

                <span className="text-muted-foreground self-end font-mono text-[12px] tabular-nums">
                  {fill(t("{n} caracteres"), { n: value.length })}
                </span>
              </DrillPanel>
            )}
          </>
        );
      }}
    />
  );
}
