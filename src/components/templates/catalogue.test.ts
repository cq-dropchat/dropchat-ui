import { describe, expect, it } from "vitest";
import type { AgentTemplateVersion } from "@/queries/useAgentTemplates";
import { catalogueVersion, publishFailure, slugify } from "./catalogue";

const t = (text: string) => text;

const version = (
  n: number,
  extra: Partial<AgentTemplateVersion> = {},
): AgentTemplateVersion =>
  ({
    version: n,
    retired_at: null,
    canary_organizations: null,
    ...extra,
  }) as AgentTemplateVersion;

describe("the version the catalogue hands out", () => {
  it("is the newest one that is neither retired nor staged", () => {
    const versions = [
      version(1),
      version(2),
      version(3, { canary_organizations: ["org-a"] }),
      version(4, { retired_at: "2026-09-20T00:00:00.000Z" }),
    ];

    expect(catalogueVersion(versions)?.version).toBe(2);
  });

  // A platform admin sees the staged versions that RLS hides from everybody
  // else, so «the newest one» would call a test the catalogue.
  it("is nothing while the only version is still in a test", () => {
    expect(
      catalogueVersion([version(1, { canary_organizations: ["org-a"] })]),
    ).toBeUndefined();
  });
});

describe("the identifier a template proposes", () => {
  it("is the name without accents, spaces or capitals", () => {
    expect(slugify("Ventas contra entrega")).toBe("ventas-contra-entrega");
    expect(slugify("Postventa & Devoluciones")).toBe("postventa-devoluciones");
    expect(slugify("  Reservas de hora  ")).toBe("reservas-de-hora");
  });

  it("never starts or ends with a dash, whatever was typed", () => {
    expect(slugify("¡Ventas!")).toBe("ventas");
    expect(slugify("---")).toBe("");
  });
});

describe("why a publish was refused", () => {
  // The guards raise English sentences with the slug interpolated. Each one
  // we put there ourselves becomes a sentence with a next step in it.
  it("turns «nothing changed» into what to do about it", () => {
    const failure = publishFailure(
      "nothing changed since the last published version of ventas-contra-entrega",
      t,
    );

    expect(failure.title).toBe("No hay nada que publicar");
    expect(failure.body).toContain("Cambiala en el agente");
  });

  it("names the source agent when there is none, or it is gone", () => {
    expect(
      publishFailure("template ventas has no source agent", t).title,
    ).toContain("agente de origen");
    expect(
      publishFailure("the source agent of ventas is gone", t).title,
    ).toContain("ya no existe");
  });

  it("keeps a generic title for a failure nobody wrote a sentence for", () => {
    const failure = publishFailure("TypeError: fetch failed", t);

    expect(failure.title).toBe("No se pudo publicar");
  });
});
