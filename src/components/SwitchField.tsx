import {
  Controller,
  type Control,
  type FieldValues,
  type Path,
} from "react-hook-form";
import Switch from "@/components/Switch";

interface SwitchFieldProps<T extends FieldValues> {
  name: Path<T>;
  control: Control<T>;
  label: string;
  description?: string;
  /** What an unset value means — the backend's default, not the form's. */
  defaultChecked?: boolean;
  disabled?: boolean;
}

export default function SwitchField<T extends FieldValues>({
  name,
  control,
  label,
  description,
  defaultChecked = false,
  disabled,
}: SwitchFieldProps<T>) {
  return (
    <Controller
      name={name}
      control={control}
      render={({ field }) => (
        <label className="flex items-center gap-[12px] cursor-pointer justify-between">
          <div className="flex flex-col gap-[2px]">
            <div className="text-foreground">{label}</div>
            {description && (
              <p className="text-muted-foreground text-[14px]">{description}</p>
            )}
          </div>
          <Switch
            checked={(field.value as boolean | undefined) ?? defaultChecked}
            onCheckedChange={field.onChange}
            disabled={disabled}
            className="mt-[4px]"
          />
        </label>
      )}
    />
  );
}
