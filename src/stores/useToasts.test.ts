import { beforeEach, describe, expect, it } from "vitest";
import useToasts, { toast } from "./useToasts";

beforeEach(() => useToasts.getState().clear());

describe("the notices the app can give", () => {
  it("keeps them in the order they happened", () => {
    toast.success("Publicaste la v4");
    toast.error("No se pudo publicar");

    expect(useToasts.getState().toasts.map((one) => one.title)).toEqual([
      "Publicaste la v4",
      "No se pudo publicar",
    ]);
    expect(useToasts.getState().toasts.map((one) => one.tone)).toEqual([
      "success",
      "destructive",
    ]);
  });

  it("dismisses one without touching the others", () => {
    const first = toast.info("Uno");
    toast.info("Dos");

    useToasts.getState().dismiss(first);

    expect(useToasts.getState().toasts).toHaveLength(1);
    expect(useToasts.getState().toasts[0].title).toBe("Dos");
  });

  it("gives every notice an id of its own, so two alike are still two", () => {
    const first = toast.success("Guardado");
    const second = toast.success("Guardado");

    expect(first).not.toBe(second);
    expect(useToasts.getState().toasts).toHaveLength(2);
  });
});
