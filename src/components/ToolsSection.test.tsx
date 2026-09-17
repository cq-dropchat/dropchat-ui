import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useForm, type UseFormGetValues } from "react-hook-form";
import ToolsSection, { type ToolsForm } from "./ToolsSection";
import type { ToolConfig } from "@/supabase/client";

// F29 (step 3) — characterization of ToolsSection (1,583 lines: the list,
// the new-tool picker and five editors in one file), written before moving
// each editor to its own module. It renders every screen and snapshots its
// HTML and the form values after adding, toggling and deleting tools. The
// move must leave every snapshot unchanged.

vi.mock("@/queries/useAgents", () => ({
  useCurrentAgent: () => ({ data: { role: "owner" } }),
}));
vi.mock("@/queries/useApiKeys", () => ({
  // An existing key, so the OpenBSP editor's auto-auth creates nothing.
  useApiKeys: () => ({
    data: [{ name: "OpenBSP MCP", key: "test-api-key-not-real" }],
  }),
  useCreateApiKey: () => ({ mutateAsync: vi.fn() }),
}));

const TOOLS: ToolConfig[] = [
  {
    provider: "local",
    type: "mcp",
    label: "erp",
    config: { url: "https://mcp.example.test/mcp" },
  },
  {
    provider: "local",
    type: "mcp",
    label: "agenda",
    config: {
      url: "https://g.mcp.openbsp.dev/mcp",
      product: "calendar",
      allowed_tools: ["list_events"],
    },
  },
  {
    provider: "local",
    type: "mcp",
    label: "whatsapp",
    config: {
      url: "http://127.0.0.1:54321/functions/v1/mcp",
      product: "openbsp",
      allowed_tools: ["list_conversations"],
      headers: { authorization: "Bearer test-api-key-not-real" },
    },
  },
  {
    provider: "local",
    type: "http",
    label: "api",
    config: { url: "https://api.example.test", methods: ["GET"] },
  },
  {
    provider: "local",
    type: "sql",
    label: "db",
    config: {
      driver: "postgres",
      host: "db.example.test",
      port: 5432,
      database: "shop",
    },
  },
  { provider: "local", type: "function", name: "calculator" },
] as ToolConfig[];

let getValues: UseFormGetValues<ToolsForm>;

function Harness({ tools }: { tools: ToolConfig[] }) {
  const form = useForm<ToolsForm>({ defaultValues: { extra: { tools } } });
  getValues = form.getValues;
  return (
    <ToolsSection
      control={form.control}
      register={form.register}
      setValue={form.setValue}
    />
  );
}

const click = (el: Element) => act(() => fireEvent.click(el));
const byTitle = (title: string) => screen.getAllByTitle(title)[0];

function openList() {
  render(<Harness tools={structuredClone(TOOLS)} />);
  return click(screen.getByText("Herramientas"));
}

describe("F29: ToolsSection (characterization)", () => {
  it("lists the tools", async () => {
    await openList();
    expect(document.body.innerHTML).toMatchSnapshot();
  });

  for (const label of ["erp", "agenda", "whatsapp", "api", "db"]) {
    it(`opens the editor of ${label}`, async () => {
      await openList();
      await click(screen.getByText(label));
      expect(document.body.innerHTML).toMatchSnapshot();
    });
  }

  it("shows the new-tool picker", async () => {
    await openList();
    await click(screen.getByText("Agregar herramienta"));
    expect(document.body.innerHTML).toMatchSnapshot();
  });

  for (const option of [
    "WhatsApp",
    "Cliente MCP",
    "Cliente HTTP",
    "Cliente SQL",
    "Google Calendar",
    "Google Sheets",
  ]) {
    it(`adds a ${option} tool`, async () => {
      await openList();
      await click(screen.getByText("Agregar herramienta"));
      await click(screen.getByText(option));
      expect(document.body.innerHTML).toMatchSnapshot("editor");
      expect(getValues("extra.tools")?.at(-1)).toMatchSnapshot("new tool");
    });
  }

  it("toggles the calculator", async () => {
    await openList();
    const calculator = screen
      .getByText("Calculadora")
      .closest("label")!
      .querySelector("button, input")!;
    await click(calculator);
    expect(getValues("extra.tools")?.some((t) => t.type === "function")).toBe(
      false,
    );
    await click(calculator);
    expect(getValues("extra.tools")?.at(-1)).toEqual({
      provider: "local",
      type: "function",
      name: "calculator",
    });
  });

  it("deletes a tool from its editor", async () => {
    await openList();
    await click(screen.getByText("api"));
    await click(byTitle("Eliminar"));
    expect(getValues("extra.tools")?.map((t) => t.type)).toMatchSnapshot();
    expect(document.body.innerHTML).toMatchSnapshot();
  });
});
