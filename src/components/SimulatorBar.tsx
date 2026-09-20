import { useState } from "react";
import { FlaskConical } from "lucide-react";
import useBoundStore from "@/stores/useBoundStore";
import { useTranslation } from "@/hooks/useTranslation";
import { resetSandbox, simulatorAddress } from "@/utils/SimulatorUtils";
import Button from "./Button";

/**
 * S1 — the band across the top of a drill.
 *
 * Two jobs, and the first one is the important one: a simulated
 * conversation is pixel for pixel a real one — same chat, same bubbles,
 * same agent, by design — so without a mark on screen there is nothing to
 * tell a member that the customer on the other side is themselves. The
 * second is "Reiniciar", which throws the drills away and starts over.
 */
export default function SimulatorBar() {
  const { translate: t } = useTranslation();
  const [resetting, setResetting] = useState(false);

  const conversation = useBoundStore((state) =>
    state.chat.conversations.get(state.ui.activeConvId || ""),
  );

  // The caller's own agent in this organization — which is also the address
  // their drills are opened from, and so what "mine" means to RLS.
  const ownAgentId = useBoundStore((state) => state.chat.ownAgentId);

  if (conversation?.service !== "sandbox") return null;

  const reset = async () => {
    if (!ownAgentId) return;

    setResetting(true);

    try {
      await resetSandbox(
        conversation.organization_id,
        simulatorAddress(ownAgentId),
      );
    } finally {
      setResetting(false);
    }
  };

  return (
    <div
      role="status"
      className="flex items-center gap-[8px] px-[16px] py-[8px] bg-muted border-b border-border text-[13px] text-foreground"
    >
      <FlaskConical className="w-[16px] h-[16px] shrink-0" />
      <span className="grow">
        {t(
          "Estás probando como cliente. Nadie recibe estos mensajes y no salen webhooks.",
        )}
      </span>
      <Button
        type="button"
        onClick={reset}
        loading={resetting}
        disabled={!ownAgentId}
        title={t("Borra solo tus pruebas, no las de tus compañeros.")}
        className="shrink-0 px-[12px] py-[4px] rounded-lg border border-border"
      >
        {t("Reiniciar")}
      </Button>
    </div>
  );
}
