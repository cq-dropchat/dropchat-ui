// The shared form pieces, tested where they carry meaning rather than style:
// what a screen reader is told, and what a paste turns into.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ChipsInput from "./ChipsInput";
import ConfirmDialog from "./ConfirmDialog";
import Field from "./Field";
import Toaster from "./Toaster";
import useToasts, { toast } from "@/stores/useToasts";

describe("Field", () => {
  it("ties the hint and the error to the control it belongs to", () => {
    render(
      <Field
        label="Qué cambió"
        hint="Lo leen los equipos al actualizar."
        error="Escribí una línea."
      >
        {(field) => <input {...field} className="text" />}
      </Field>,
    );

    const input = screen.getByLabelText("Qué cambió");
    const describedBy = input.getAttribute("aria-describedby")!.split(" ");

    expect(describedBy).toHaveLength(2);
    expect(
      describedBy.map((id) => document.getElementById(id)?.textContent),
    ).toEqual(["Lo leen los equipos al actualizar.", "Escribí una línea."]);
    // The red border is never the only signal.
    expect(input).toHaveAttribute("aria-invalid", "true");
  });

  it("counts characters and says when they are too many", () => {
    render(
      <Field label="Nombre" count={{ value: 12, max: 10 }}>
        {(field) => <input {...field} className="text" />}
      </Field>,
    );

    expect(screen.getByText("12/10").className).toContain("text-destructive");
  });
});

describe("ChipsInput", () => {
  function Harness() {
    const [value, setValue] = useState<string[]>([]);
    return (
      <Field label="Organizaciones">
        {(field) => <ChipsInput {...field} value={value} onChange={setValue} />}
      </Field>
    );
  }

  it("turns a pasted list into one chip per id", async () => {
    render(<Harness />);

    await userEvent.type(
      screen.getByLabelText("Organizaciones"),
      "9f2c1d84, 3b70ae55,",
    );

    expect(screen.getByText("9f2c1d84")).toBeVisible();
    expect(screen.getByText("3b70ae55")).toBeVisible();
  });

  it("drops one without touching the rest", async () => {
    render(<Harness />);

    await userEvent.type(
      screen.getByLabelText("Organizaciones"),
      "9f2c1d84 3b70ae55 ",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Quitar 9f2c1d84" }),
    );

    expect(screen.queryByText("9f2c1d84")).toBeNull();
    expect(screen.getByText("3b70ae55")).toBeVisible();
  });

  it("does not keep the same id twice", async () => {
    render(<Harness />);

    await userEvent.type(
      screen.getByLabelText("Organizaciones"),
      "9f2c1d84 9f2c1d84 ",
    );

    expect(screen.getAllByText("9f2c1d84")).toHaveLength(1);
  });
});

describe("ConfirmDialog", () => {
  it("asks, and Escape is an answer", async () => {
    const onCancel = vi.fn();

    render(
      <ConfirmDialog
        open
        title="¿Retirar la v3?"
        confirmLabel="Retirar la v3"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      >
        Sale del catálogo.
      </ConfirmDialog>,
    );

    // Focus lands on the way out, not on the destructive button.
    expect(screen.getByRole("button", { name: "Cancelar" })).toHaveFocus();

    await userEvent.keyboard("{Escape}");

    expect(onCancel).toHaveBeenCalled();
  });
});

describe("Toaster", () => {
  beforeEach(() => useToasts.getState().clear());

  it("shows what happened and lets it be dismissed", async () => {
    render(<Toaster />);

    toast.success("Publicaste la v4", "La ven 2 organizaciones.");

    expect(await screen.findByText("Publicaste la v4")).toBeVisible();

    await userEvent.click(screen.getByRole("button", { name: "Cerrar aviso" }));

    await waitFor(() =>
      expect(screen.queryByText("Publicaste la v4")).toBeNull(),
    );
  });
});
