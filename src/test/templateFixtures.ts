// The catalogue as the panel's two halves read it. Shared so the list and the
// center are tested against the same rows rather than two hand-kept copies.
export const TEMPLATE_ID = "11111111-0000-4000-8000-000000000001";

export const VERSION = {
  template_id: TEMPLATE_ID,
  version: 1,
  config: { instructions: "Atendé pedidos" },
  config_hash: "h1",
  changelog: "primera",
  published_by: null,
  published_at: "2026-09-21T00:00:00.000Z",
  retired_at: null,
  canary_organizations: null as string[] | null,
};

export const TEMPLATES = [
  {
    id: TEMPLATE_ID,
    slug: "ventas-contra-entrega",
    name: "Ventas contra entrega",
    description: "Toma pedidos.",
    category: "ventas",
    source_agent_id: "a0000000-0000-4000-8000-00000000000a",
    archived_at: null as string | null,
    created_at: "2026-09-21T00:00:00.000Z",
    updated_at: "2026-09-21T00:00:00.000Z",
    agent_template_versions: [VERSION],
  },
];
