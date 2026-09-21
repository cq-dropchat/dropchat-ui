import { useFormState, type Control, type FieldValues } from "react-hook-form";

/** Whether anything in the tree of touched fields is actually true. */
function any(dirty: object): boolean {
  return Object.values(dirty).some((value) =>
    value && typeof value === "object" ? any(value as object) : Boolean(value),
  );
}

/**
 * Whether somebody has changed a field of this form.
 *
 * NOT `formState.isDirty`, which deep-compares the whole form against the
 * whole default object, key by key. The controls do not read back exactly
 * what a row holds — an empty text field is `""`, a radio group with nothing
 * checked is `null`, an empty number field is `NaN`, none of which a row that
 * simply lacks the key carries — so `isDirty` reports a screen nobody has
 * touched as changed. `dirtyFields` answers the question that is actually
 * being asked.
 *
 * The directive is the price of asking it. React Hook Form MUTATES
 * `dirtyFields` in place and hands back the same object every time, so the
 * React Compiler caches the answer on an identity that never changes and the
 * «cambios sin guardar» bar never appears. Confined to these three lines: the
 * component that calls it stays compiled.
 */
export default function useHasChanges<T extends FieldValues>(
  control: Control<T>,
): boolean {
  "use no memo";

  const { dirtyFields } = useFormState({ control });

  return any(dirtyFields);
}
