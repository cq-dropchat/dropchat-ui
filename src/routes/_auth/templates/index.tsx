import { createFileRoute } from "@tanstack/react-router";

// The list is the layout's own (templates.tsx) and the center reads the
// pathname, the way /stats does. Nothing more belongs in the left panel.
export const Route = createFileRoute("/_auth/templates/")({
  component: () => null,
});
