// T7 — the template catalogue, as the UI reads it.
//
// Global, like the model tiers: every organization sees the same rows, and RLS
// is what decides which ones. A tenant reads templates that are not archived
// and versions that are not retired; a platform admin reads all of them, which
// is what the publishing panel is built on.
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type Database, supabase } from "@/supabase/client";
import useBoundStore from "@/stores/useBoundStore";
import { queryKeys } from "./queryKeys";

export type AgentTemplate =
  Database["public"]["Tables"]["agent_templates"]["Row"];
export type AgentTemplateVersion =
  Database["public"]["Tables"]["agent_template_versions"]["Row"];

/** A catalogue entry with the versions this caller is allowed to see. */
export type TemplateWithVersions = AgentTemplate & {
  agent_template_versions: AgentTemplateVersion[];
};

/**
 * The newest version anybody can still install.
 *
 * T5's staged publication needs no filter here: a version staged for other
 * organizations is not readable by this one, so it never arrives in the first
 * place. What this list holds is already «what we may install».
 */
export function installableVersion(
  template: TemplateWithVersions,
): AgentTemplateVersion | undefined {
  return template.agent_template_versions
    .filter((version) => version.retired_at === null)
    .sort((a, b) => b.version - a.version)[0];
}

export function useAgentTemplates() {
  const userId = useBoundStore((state) => state.ui.user?.id);

  return useQuery({
    queryKey: queryKeys.agentTemplates.all(),
    queryFn: async () =>
      await supabase
        .from("agent_templates")
        .select("*, agent_template_versions(*)")
        .order("name")
        .throwOnError(),
    enabled: !!userId,
    select: (data) => data.data as unknown as TemplateWithVersions[],
  });
}

/**
 * The template this agent is the SOURCE of, when it is the source of one.
 *
 * The pointer read backwards. `agent_templates.source_agent_id` is what
 * `publish_agent_template_version` freezes into a version, and until now the
 * link only existed in one direction: the template panel offers «abrir el
 * agente de origen», and the agent had no idea it was one. Which is how
 * somebody deletes it — `on delete set null` — and finds out at the next
 * publish, with «template X has no source agent».
 *
 * Its own query and not a `find` over `useAgentTemplates`: that one carries
 * every version of every template with its whole config, and this runs on an
 * agent screen that has no other reason to want it. Here it is one row of
 * three columns, or none at all, which is the answer for every tenant.
 */
export function useTemplateOfSource(agentId: string) {
  const userId = useBoundStore((state) => state.ui.user?.id);

  return useQuery({
    queryKey: queryKeys.agentTemplates.ofSource(agentId),
    queryFn: async () =>
      await supabase
        .from("agent_templates")
        .select("id,name,slug")
        .eq("source_agent_id", agentId)
        .throwOnError(),
    enabled: !!userId && !!agentId,
    select: (data) => data.data?.[0],
  });
}

/**
 * The versions of ONE template, newest first — what the update notice reads to
 * show a changelog, and what the publishing panel lists.
 */
export function useAgentTemplateVersions(templateId: string | null) {
  return useQuery({
    queryKey: queryKeys.agentTemplates.versions(templateId),
    queryFn: async () =>
      await supabase
        .from("agent_template_versions")
        .select()
        .eq("template_id", templateId!)
        .order("version", { ascending: false })
        .throwOnError(),
    enabled: !!templateId,
    select: (data) => data.data,
  });
}

/**
 * Install: one RPC, and the agent it creates is in `draft` (B4). Everything
 * else about it — the provider, the model, the protocol — is the version it
 * points at, which is the whole point of T7's acceptance criterion.
 */
export function useInstallAgentTemplate() {
  const queryClient = useQueryClient();
  const orgId = useBoundStore((state) => state.ui.activeOrgId);

  return useMutation({
    mutationFn: async (args: {
      templateId: string;
      version?: number;
      name?: string;
    }) => {
      if (!orgId) throw new Error("No active organization");

      const { data } = await supabase
        .rpc("install_agent_template", {
          _organization_id: orgId,
          _template_id: args.templateId,
          _version: args.version,
          _name: args.name,
        })
        .throwOnError();

      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.agents.all(orgId),
      });
    },
  });
}

/** Take a version: the newest installable one when none is named (D7). */
export function useUpdateAgentTemplateVersion() {
  const queryClient = useQueryClient();
  const orgId = useBoundStore((state) => state.ui.activeOrgId);

  return useMutation({
    mutationFn: async (args: { agentId: string; version?: number }) => {
      const { data } = await supabase
        .rpc("update_agent_template_version", {
          _agent_id: args.agentId,
          _version: args.version,
        })
        .throwOnError();

      return data;
    },
    onSuccess: (_data, args) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.agents.detail(orgId, args.agentId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.agents.all(orgId),
      });
    },
  });
}

/**
 * Unlink: the effective configuration is frozen into the agent's own `extra`
 * and the pointer goes. It keeps answering exactly as it did; what it stops
 * getting is new versions.
 */
export function useUnlinkAgentTemplate() {
  const queryClient = useQueryClient();
  const orgId = useBoundStore((state) => state.ui.activeOrgId);

  return useMutation({
    mutationFn: async (agentId: string) => {
      const { data } = await supabase
        .rpc("unlink_agent_template", { _agent_id: agentId })
        .throwOnError();

      return data;
    },
    onSuccess: (_data, agentId) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.agents.detail(orgId, agentId),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.agents.all(orgId),
      });
    },
  });
}

// ---------------------------------------------------------------------------
// The publishing panel (T7). Everything below is a platform admin's, and RLS
// is what says so — for anybody else these queries come back empty and the
// mutations raise 42501.
// ---------------------------------------------------------------------------

/**
 * Which organization templates are built in (D12/D6). Readable by platform
 * admins alone, so an empty answer means either "not an admin" or "nobody
 * configured it yet" — the panel says the second only when it knows the first.
 */
export function usePlatformSettings() {
  return useQuery({
    queryKey: queryKeys.agentTemplates.platformSettings(),
    queryFn: async () =>
      await supabase
        .from("platform_settings")
        .select()
        .maybeSingle()
        .throwOnError(),
    select: (data) => data.data,
  });
}

/** The AI agents of the template organization: what a template is built FROM. */
export function useTemplateSourceAgents(organizationId: string | null) {
  return useQuery({
    queryKey: queryKeys.agentTemplates.sources(organizationId),
    queryFn: async () =>
      await supabase
        .from("agents")
        .select("id, name")
        .eq("organization_id", organizationId!)
        .is("user_id", null)
        .is("deleted_at", null)
        .order("name")
        .throwOnError(),
    enabled: !!organizationId,
    select: (data) => data.data,
  });
}

function useCatalogueMutation<TArgs>(
  mutationFn: (args: TArgs) => Promise<unknown>,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.agentTemplates.all(),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.agentTemplates.versions(null).slice(0, 1),
      });
    },
  });
}

export function useCreateAgentTemplate() {
  return useCatalogueMutation(
    async (args: {
      slug: string;
      name: string;
      description: string;
      category: string;
      source_agent_id: string;
    }) =>
      (
        await supabase
          .from("agent_templates")
          .insert(args)
          .select()
          .single()
          .throwOnError()
      ).data,
  );
}

/**
 * Archiving, not deleting: the organizations that installed a version keep
 * pointing at it, and deleting the row would make their agent unexplainable.
 */
export function useArchiveAgentTemplate() {
  return useCatalogueMutation(
    async (args: { id: string; archived: boolean }) =>
      (
        await supabase
          .from("agent_templates")
          .update({
            archived_at: args.archived ? new Date().toISOString() : null,
          })
          .eq("id", args.id)
          .select()
          .single()
          .throwOnError()
      ).data,
  );
}

/**
 * Publish the source agent's current configuration as the next version.
 *
 * T5: with `canary`, it goes to those organizations and nobody else until it
 * is promoted. Without it, to everybody — which is what every version before
 * staged publication existed did.
 */
export function usePublishAgentTemplateVersion() {
  return useCatalogueMutation(
    async (args: {
      templateId: string;
      changelog: string;
      canary?: string[];
    }) =>
      (
        await supabase
          .rpc("publish_agent_template_version", {
            _template_id: args.templateId,
            _changelog: args.changelog || undefined,
            _canary_organizations: args.canary?.length
              ? args.canary
              : undefined,
          })
          .throwOnError()
      ).data,
  );
}

/** Promote a staged version: it stops being for two organizations. */
export function usePromoteAgentTemplateVersion() {
  return useCatalogueMutation(
    async (args: { templateId: string; version: number }) =>
      (
        await supabase
          .rpc("promote_agent_template_version", {
            _template_id: args.templateId,
            _version: args.version,
          })
          .throwOnError()
      ).data,
  );
}

/** Pull one version. Agents already on it keep running (T6). */
export function useRetireAgentTemplateVersion() {
  return useCatalogueMutation(
    async (args: { templateId: string; version: number }) =>
      (
        await supabase
          .rpc("retire_agent_template_version", {
            _template_id: args.templateId,
            _version: args.version,
          })
          .throwOnError()
      ).data,
  );
}
