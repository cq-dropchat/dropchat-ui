import { createFileRoute } from "@tanstack/react-router";
import AgentEditor from "@/components/agents/AgentEditor";

export const Route = createFileRoute("/_auth/agents/$agentId")({
  component: RouteComponent,
});

function RouteComponent() {
  const { agentId } = Route.useParams();

  return <AgentEditor agentId={agentId} />;
}
