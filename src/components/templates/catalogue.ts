import type { AgentTemplateVersion } from "@/queries/useAgentTemplates";

/**
 * The pieces of the template panel that are worth testing on their own: which
 * version the catalogue hands out, the identifier it proposes, and what a
 * failed publish actually means.
 */

/**
 * The version anybody who is not in a staged test installs today.
 *
 * `installableVersion` in the query layer answers this for a TENANT, where
 * RLS has already removed the staged versions from the rows. A platform admin
 * sees them all, so here the staged ones have to be skipped by hand —
 * otherwise the panel tells the person who staged v3 for two organizations
 * that v3 is «en catálogo», which is exactly what staging means it is not.
 */
export function catalogueVersion(
  versions: AgentTemplateVersion[],
): AgentTemplateVersion | undefined {
  return versions
    .filter(
      (version) =>
        version.retired_at === null && !version.canary_organizations?.length,
    )
    .sort((a, b) => b.version - a.version)[0];
}

/** «Ventas contra entrega» → «ventas-contra-entrega». */
export function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * The guards in `publish_agent_template_version` raise their reasons as
 * Postgres exceptions: English, lower case, with the slug interpolated —
 * «nothing changed since the last published version of ventas-contra-entrega».
 * True, and useless to whoever is looking at the screen in Spanish.
 *
 * This turns the ones we put there ourselves into a sentence with a next
 * step. Anything else keeps the generic title, and every case keeps the
 * original text under «Detalle técnico», because the unknown ones are
 * exactly the ones somebody will have to read.
 */
export function publishFailure(
  message: string,
  t: (text: string) => string,
): { title: string; body: string } {
  const raw = message.toLowerCase();

  if (raw.includes("nothing changed"))
    return {
      title: t("No hay nada que publicar"),
      body: t(
        "La configuración del agente de origen es idéntica a la última versión. Cambiala en el agente y volvé acá.",
      ),
    };

  if (raw.includes("has no source agent"))
    return {
      title: t("Esta plantilla no tiene agente de origen"),
      body: t(
        "Una versión es una copia de la configuración de un agente. Asigná uno antes de publicar.",
      ),
    };

  if (raw.includes("source agent") && raw.includes("is gone"))
    return {
      title: t("El agente de origen ya no existe"),
      body: t("Lo borraron. Apuntá la plantilla a otro agente de origen."),
    };

  if (raw.includes("not in the template organization"))
    return {
      title: t("El agente de origen no es de la organización de plantillas"),
      body: t(
        "Publicar copiaría la configuración de un cliente al catálogo que ven todos.",
      ),
    };

  if (raw.includes("no template organization is configured"))
    return {
      title: t("Falta configurar la organización de plantillas"),
      body: t("Está en el runbook de README.md."),
    };

  if (raw.includes("is archived"))
    return {
      title: t("Esta plantilla está archivada"),
      body: t("Recuperala primero: una plantilla archivada no publica."),
    };

  if (raw.includes("not a platform admin") || raw.includes("not allowed"))
    return {
      title: t("No tenés permiso para publicar"),
      body: t("Solo un administrador de la plataforma puede hacerlo."),
    };

  return {
    title: t("No se pudo publicar"),
    body: t("Nadie instaló nada: la versión no llegó a crearse."),
  };
}
