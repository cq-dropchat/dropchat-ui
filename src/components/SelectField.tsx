import { useState } from "react";
import { ChevronRight, Check } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import DrillPanel from "@/components/ui/DrillPanel";
import {
  Controller,
  type Control,
  type FieldValues,
  type Path,
} from "react-hook-form";

export interface SelectOption {
  value: string;
  label: string;
}

// --- Types ---

interface BaseSelectProps {
  label: string;
  placeholder?: string;
  options: SelectOption[];
  disabled?: boolean;
  /** The name of the thing being edited, carried into the sub-panel. */
  owner?: string;
}

// Single Select
interface SingleSelectControlledProps<T extends FieldValues>
  extends BaseSelectProps {
  multiple?: false;
  name: Path<T>;
  control: Control<T>;
  required?: boolean;
  onValueChange?: (value: string) => void;
}

interface SingleSelectUncontrolledProps extends BaseSelectProps {
  multiple?: false;
  value: string;
  onChange: (value: string) => void;
}

// Multi Select
interface MultiSelectControlledProps<T extends FieldValues>
  extends BaseSelectProps {
  multiple: true;
  name: Path<T>;
  control: Control<T>;
  required?: boolean;
  onValueChange?: (value: string[]) => void;
}

interface MultiSelectUncontrolledProps extends BaseSelectProps {
  multiple: true;
  value: string[];
  onChange: (value: string[]) => void;
}

// Union
type SelectFieldProps<T extends FieldValues> =
  | SingleSelectControlledProps<T>
  | SingleSelectUncontrolledProps
  | MultiSelectControlledProps<T>
  | MultiSelectUncontrolledProps;

function isControlled<T extends FieldValues>(
  props: SelectFieldProps<T>,
): props is SingleSelectControlledProps<T> | MultiSelectControlledProps<T> {
  return "control" in props;
}

export default function SelectField<T extends FieldValues>(
  props: SelectFieldProps<T>,
) {
  const { translate: t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  const { label, placeholder, options, disabled, multiple } = props;

  // Render the actual select UI
  // internally we treat value as string | string[] to share logic
  const renderSelect = (
    value: string | string[] | undefined,
    handleChange: (val: string | string[]) => void,
  ) => {
    const getDisplayLabel = () => {
      if (multiple && Array.isArray(value)) {
        if (value.length === 0) return placeholder || t("Seleccionar") + "...";
        const selectedLabels = options
          .filter((o) => value.includes(o.value))
          .map((o) => o.label);
        if (selectedLabels.length <= 5) {
          return selectedLabels.join(", ");
        }
        const first5 = selectedLabels.slice(0, 5).join(", ");
        const remaining = selectedLabels.length - 5;
        return `${first5} ${t("y")} ${remaining} ${t("más")}...`;
      }
      const selectedOption = options.find((o) => o.value === value);
      return selectedOption?.label || placeholder || t("Seleccionar") + "...";
    };

    const hasSelection = multiple
      ? Array.isArray(value) && value.length > 0
      : !!value;

    return (
      <>
        {/* Trigger */}
        <label>
          <div className="label">{label}</div>
          <button
            type="button"
            className="text w-full flex justify-between items-center text-left"
            onClick={() => !disabled && setIsOpen(true)}
            disabled={disabled}
          >
            <span
              className={
                hasSelection ? "text-foreground" : "text-muted-foreground"
              }
            >
              {getDisplayLabel()}
            </span>
            <ChevronRight className="w-[20px] h-[20px] ml-[12px] text-muted-foreground shrink-0" />
          </button>
        </label>

        {/* The options, in a panel of their own */}
        {isOpen && (
          <DrillPanel
            title={label}
            subtitle={props.owner}
            onBack={() => setIsOpen(false)}
            className="gap-0 p-[10px]"
          >
            {options.map((option) => {
              const isSelected = multiple
                ? Array.isArray(value) && value.includes(option.value)
                : value === option.value;

              return (
                <button
                  key={option.value}
                  type="button"
                  role={multiple ? "checkbox" : "radio"}
                  aria-checked={isSelected}
                  className="hover:bg-accent flex min-h-[48px] w-full items-center gap-[12px] rounded-xl px-[10px] py-[12px] text-left"
                  onClick={() => {
                    if (multiple) {
                      const currentRef = Array.isArray(value) ? value : [];
                      const newValue = currentRef.includes(option.value)
                        ? currentRef.filter((v) => v !== option.value)
                        : [...currentRef, option.value];
                      handleChange(newValue);
                    } else {
                      handleChange(option.value);
                      setIsOpen(false);
                    }
                  }}
                >
                  <span
                    aria-hidden
                    className={`flex h-[20px] w-[20px] shrink-0 items-center justify-center border-[2px] ${
                      isSelected ? "border-primary bg-primary" : "border-input"
                    } ${multiple ? "rounded-[4px]" : "rounded-full"}`}
                  >
                    {isSelected &&
                      (multiple ? (
                        <Check className="text-primary-foreground h-[14px] w-[14px]" />
                      ) : (
                        <span className="bg-primary-foreground h-[8px] w-[8px] rounded-full" />
                      ))}
                  </span>
                  <span className="text-foreground text-[16px]">
                    {option.label}
                  </span>
                </button>
              );
            })}
          </DrillPanel>
        )}
      </>
    );
  };

  // Controlled mode: wrap with Controller
  if (isControlled(props)) {
    // We cast to access properties safely, knowing strict types guide external usage
    const { name, control, required, onValueChange } = props;
    // We need to cast props to any or specific controlled type because TS can't narrow generic union easily here
    const isMultiple = props.multiple === true;

    return (
      <Controller
        name={name}
        control={control}
        rules={{ required }}
        render={({ field }) =>
          renderSelect(field.value, (val) => {
            field.onChange(val);
            // safe cast because we know usage matches prop
            if (onValueChange) {
              if (isMultiple) {
                (onValueChange as (v: string[]) => void)(val as string[]);
              } else {
                (onValueChange as (v: string) => void)(val as string);
              }
            }
          })
        }
      />
    );
  }

  // Uncontrolled mode
  const p = props as unknown as
    | SingleSelectUncontrolledProps
    | MultiSelectUncontrolledProps;

  return renderSelect(p.value, (val) => {
    if (p.multiple) {
      (p.onChange as (v: string[]) => void)(val as string[]);
    } else {
      (p.onChange as (v: string) => void)(val as string);
    }
  });
}
