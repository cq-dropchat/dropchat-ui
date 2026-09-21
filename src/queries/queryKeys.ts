type NullableId = string | null | undefined;

/**
 * Detail queries cache the raw Supabase response and unwrap it with `select`,
 * so a mutation has to merge the fresh row into that wrapper — writing a bare
 * row would make `select` read `undefined`.
 */
export type CachedResponse<T> = { data: T; error: null };

export const queryKeys = {
  agents: {
    all: (orgId: NullableId) => [orgId, "agents"] as const,
    detail: (orgId: NullableId, id: NullableId) =>
      [orgId, "agents", id] as const,
    current: (orgId: NullableId) => [orgId, "agents", "current"] as const,
    profile: (orgId: NullableId, id: NullableId) =>
      [orgId, "agents", "profile", id] as const,
  },
  invitations: {
    mine: () => ["invitations", "mine"] as const,
    all: (orgId: NullableId) => [orgId, "invitations"] as const,
  },
  apiKeys: {
    all: (orgId: NullableId) => [orgId, "api_keys"] as const,
    detail: (orgId: NullableId, id: NullableId) =>
      [orgId, "api_keys", id] as const,
  },
  contacts: {
    all: (orgId: NullableId) => [orgId, "contacts_addresses"] as const,
  },
  // T7: the template catalogue is global too — every organization reads the
  // same rows. An installed agent's version belongs to the agent, so it is
  // read under the agents key, not here.
  agentTemplates: {
    all: () => ["agent_templates"] as const,
    versions: (templateId: NullableId) =>
      ["agent_templates", templateId, "versions"] as const,
    platformSettings: () => ["platform_settings"] as const,
    sources: (orgId: NullableId) =>
      ["agent_templates", "sources", orgId] as const,
  },
  // T2: global, like the tiers themselves — three rows that are the same for
  // every organization, so the key carries no org id.
  modelTiers: {
    all: () => ["model_tiers"] as const,
  },
  organizations: {
    all: () => ["organizations"] as const,
    detail: (id: NullableId) => ["organizations", id] as const,
    addresses: (orgId: NullableId) =>
      [orgId, "organizations_addresses"] as const,
    addressDetail: (orgId: NullableId, address: NullableId) =>
      [orgId, "organizations_addresses", address] as const,
    exports: (orgId: NullableId) => [orgId, "organization_exports"] as const,
  },
  webhooks: {
    all: (orgId: NullableId) => [orgId, "webhooks"] as const,
    detail: (orgId: NullableId, id: NullableId) =>
      [orgId, "webhooks", id] as const,
  },
  onboardingTokens: {
    all: (orgId: NullableId, service: string) =>
      [orgId, "onboarding_tokens", service] as const,
  },
  whatsappWeb: {
    pendingSession: (orgId: NullableId, sessionId: NullableId) =>
      [orgId, "whatsapp_web", "pending_session", sessionId] as const,
    health: (orgId: NullableId, address: NullableId) =>
      [orgId, "whatsapp_web", "health", address] as const,
  },
  billing: {
    products: () => ["billing", "products"] as const,
    usage: (orgId: NullableId, interval: string) =>
      [orgId, "billing", "usage", interval] as const,
    subscription: (orgId: NullableId) =>
      [orgId, "billing", "subscription"] as const,
    tierLimits: (orgId: NullableId) =>
      [orgId, "billing", "tier_limits"] as const,
    planProducts: (orgId: NullableId) =>
      [orgId, "billing", "plan_products"] as const,
  },
  // E1. Not keyed by organization, unlike everything above: an error issue
  // belongs to the product, not to a tenant, and the panel that reads them
  // crosses organizations by definition.
  errors: {
    issues: (status: string) => ["error_issues", status] as const,
    settings: () => ["error_settings"] as const,
    isPlatformAdmin: (userId: NullableId) =>
      ["platform_admin", userId] as const,
  },
};
