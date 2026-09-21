import type { PropsWithChildren } from "react";
import dayjs from "dayjs";
import StatusIcon from "./StatusIcon";
import { Markdown } from "./Message";
import type { Direction, MessageRow, OutgoingStatus } from "@/supabase/client";

/**
 * The bubble frame the structured cards share: a panel, the caption the part
 * may carry, and the bubble's own timestamp/status corner.
 *
 * Same shape DocumentMessage builds by hand — a fixed 320px column, the
 * timestamp absolutely placed against the bubble, and the bottom padding that
 * keeps it off the content when there is no caption to push it down.
 */
export default function DataCard({
  message,
  direction,
  children,
}: PropsWithChildren<{ message: MessageRow; direction: Direction }>) {
  // Not every member of the content union carries a caption (a multi-part
  // row does not), and one member types its fields as open `Json` — so read
  // it as what it may be rather than asserting what it is.
  const given = (message.content as { text?: unknown }).text;
  const caption = typeof given === "string" ? given : undefined;

  return (
    <div className={"w-[320px]" + (caption ? "" : " pb-[25px]")}>
      {/* The panel reads as a card in both themes because it is drawn with
          the theme's own tokens. The neighbouring media renderers reach for
          `bg-black/5 dark:bg-white/5` instead, and that `dark:` is Tailwind's
          media-query variant while this app's dark mode is the `.dark` class
          — so their panel goes white-on-white the moment the two disagree. */}
      <div className="py-[13px] px-[19px] rounded-md bg-background border border-border">
        {children}
      </div>

      {/* Caption — a buyer's note on an order, mostly. Untrusted text, so it
          goes through the same Markdown/DOMPurify pipeline as any message. */}
      {caption && (
        <div className="pl-[6px] pt-[6px] pb-[5px] pr-[4px]">
          <Markdown content={caption} direction={direction} />
        </div>
      )}

      <div className="text-[11px] text-muted-foreground absolute bottom-[0px] right-[7px] flex items-center">
        {dayjs(message.timestamp).format("HH:mm")}
        {direction === "outgoing" && (
          <StatusIcon {...(message.status as OutgoingStatus)} />
        )}
      </div>
    </div>
  );
}

/**
 * An href we are willing to put in the DOM. The url on a location part is
 * whatever the connector sent us — text from outside — and an `<a href>` is
 * one of the few places where that still executes (`javascript:…`). Only
 * http(s) survives.
 */
export function safeHttpUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;

  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.href
      : undefined;
  } catch {
    return undefined;
  }
}
