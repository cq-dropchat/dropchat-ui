import {
  Controller,
  type Control,
  type FieldValues,
  type Path,
} from "react-hook-form";
import SwitchRow from "@/components/ui/SwitchRow";

interface SwitchFieldProps<T extends FieldValues> {
  name: Path<T>;
  control: Control<T>;
  label: string;
  description?: string;
  /** What an unset value means — the backend's default, not the form's. */
  defaultChecked?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  /** Without the card's rule and padding, for a flat column of fields. */
  plain?: boolean;
  last?: boolean;
}

export default function SwitchField<T extends FieldValues>({
  name,
  control,
  label,
  description,
  defaultChecked = false,
  disabled,
  disabledReason,
  plain,
  last,
}: SwitchFieldProps<T>) {
  return (
    <Controller
      name={name}
      control={control}
      render={({ field }) => (
        <SwitchRow
          label={label}
          description={description}
          checked={(field.value as boolean | undefined) ?? defaultChecked}
          onCheckedChange={field.onChange}
          disabled={disabled}
          disabledReason={disabledReason}
          plain={plain}
          last={last}
        />
      )}
    />
  );
}
