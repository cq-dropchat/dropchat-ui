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

/** The newest version anybody can still install. */
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
