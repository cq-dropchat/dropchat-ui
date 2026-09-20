import { useMemo, useState } from "react";
import { Bot, ChevronDown, User, UserRound } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { useCurrentAgent, useCurrentAgents } from "@/queries/useAgents";
import { useAssignConversation } from "@/queries/useConversationAssignment";
import type { ConversationRow } from "@/supabase/client";

/**
 * H6 — who is attending this conversation, and how to change it.
 *
 * Three states, and the difference between them is what a person needs to
 * know before typing: an AI is answering (anything you send takes it over),
 * a person holds it, or it is waiting for one — with how long it has been
 * waiting, because that is the number the customer feels.
 *
 * Only external conversations: in a `local` DM the roster names the agent
 * and there is nothing to assign.
 */
export default function ConversationAssignment({
  conversation,
}: {
  conversation: ConversationRow;
}) {
  const { translate: t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { data: agents } = useCurrentAgents();
  const { data: me } = useCurrentAgent();
  const assign = useAssignConversation();

  const aiAgents = useMemo(
    () =>
      (agents ?? []).filter(
        // The list query projects `mode` out of extra (F23), so the whole
        // `extra` — prompts, masked credentials — never reaches the browser.
        (agent) =>
          agent.user_id === null &&
          agent.mode !== "inactive" &&
          agent.mode !== "draft",
      ),
    [agents],
  );

  if (conversation.service === "local") return null;

  const assignee = agents?.find(
    (agent) => agent.id === conversation.assigned_agent_id,
  );
  const waiting = conversation.awaiting_human_since;
  const mine = assignee?.id === me?.id;

  const label = waiting
    ? t("Esperando humano")
    : assignee
      ? (assignee.name ?? t("Sin asignar"))
      : t("Sin asignar");

  const Icon = waiting ? UserRound : assignee?.user_id ? User : Bot;

  // Wall clock, not business minutes: what this says is how long the
  // customer has been waiting, which is the number a person needs before
  // deciding whether to take it. The business-hours arithmetic belongs to
  // the sweep that decides when the wait is LATE (H4), and lives in SQL.
  const waitedMinutes = waiting ? (Date.now() - +new Date(waiting)) / 60000 : 0;

  const move = (agentId: string | null) => {
    setOpen(false);
    assign.mutate({ conversationId: conversation.id, agentId });
  };

  return (
    <div className="relative">
      <button
        type="button"
        className="flex items-center gap-[6px] rounded-[8px] border border-border px-[10px] py-[6px] text-[13px] text-foreground"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid="assignment-button"
      >
        <Icon className="w-[16px] h-[16px]" aria-hidden />
        <span className="truncate max-w-[160px]">{label}</span>
        {waiting && (
          <span className="text-muted-foreground" data-testid="waited">
            {t("hace")} {formatMinutes(waitedMinutes, t)}
          </span>
        )}
        <ChevronDown className="w-[14px] h-[14px]" aria-hidden />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-[4px] min-w-[220px] rounded-[8px] border border-border bg-background py-[4px] shadow-md"
        >
          {!mine && (
            <MenuItem
              onClick={() => me && move(me.id)}
              disabled={!me || assign.isPending}
            >
              {t("Tomar conversación")}
            </MenuItem>
          )}

          {aiAgents.map((agent) => (
            <MenuItem
              key={agent.id}
              onClick={() => move(agent.id)}
              disabled={
                assign.isPending ||
                (!waiting && agent.id === conversation.assigned_agent_id)
              }
            >
              {t("Devolver a")} {agent.name}
            </MenuItem>
          ))}

          {conversation.assigned_agent_id && (
            <MenuItem onClick={() => move(null)} disabled={assign.isPending}>
              {t("Dejar sin asignar")}
            </MenuItem>
          )}
        </div>
      )}
    </div>
  );
}

function MenuItem({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className="block w-full px-[12px] py-[8px] text-left text-[13px] text-foreground hover:bg-accent disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function formatMinutes(minutes: number, t: (text: string) => string) {
  if (minutes < 60) return `${Math.max(0, Math.round(minutes))} min`;

  const hours = Math.floor(minutes / 60);

  if (hours < 24) return `${hours} h`;

  return `${Math.floor(hours / 24)} ${t("días")}`;
}
