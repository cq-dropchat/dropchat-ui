import type { ToolConfig } from "@/supabase/client";

/**
 * The slice of the agent form this section owns. React Hook Form resolves
 * field-name types (`Path<T>`) against a concrete form shape and cannot do it
 * through a generic one, so everything below is written against this shape.
 */
export type ToolsForm = { extra?: { tools?: ToolConfig[] } | null };
