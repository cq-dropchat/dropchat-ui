import { MapPin } from "lucide-react";
import DataCard, { safeHttpUrl } from "./DataCard";
import { useTranslation } from "@/hooks/useTranslation";
import type { Direction, MessageRow } from "@/supabase/client";
import type { Location } from "@/supabase/types/whatsapp_webhook_message_types";

/**
 * A place someone sent, as a card: what it is called, where it is, and a way
 * to open it on a map.
 *
 * Before this it rendered as the JSON it is stored as — a contact sharing
 * their address showed up in the conversation as
 * `{"latitude":-33.44,"longitude":-70.65,…}`.
 */
export function mapLink(data: Location | undefined): string | undefined {
  const given = safeHttpUrl(data?.url);
  if (given) return given;

  // A location part always carries coordinates; a name and an address are
  // optional. Build the link ourselves when the connector sent none.
  const { latitude, longitude } = data ?? {};
  return Number.isFinite(latitude) && Number.isFinite(longitude)
    ? `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`
    : undefined;
}

export default function LocationMessage({
  message,
  direction,
}: {
  message: MessageRow;
  direction: Direction;
}) {
  const { translate: t } = useTranslation();

  const content = message.content;

  if (content.type !== "data" || content.kind !== "location") {
    throw new Error(`Message with id ${message.id} is not a location.`);
  }

  const data = content.data;
  const link = mapLink(data);

  const card = (
    <div className="flex items-start" data-testid="location-card">
      <MapPin className="h-[22px] w-[22px] shrink-0 text-muted-foreground" />

      <div className="ml-[10px] grow min-w-0">
        <div className="break-words">{data?.name || t("Ubicación")}</div>

        {data?.address && (
          <div className="text-muted-foreground py-[3px] text-[12px] break-words">
            {data.address}
          </div>
        )}

        {link && (
          // `!`: global.css styles every `a` with `color: inherit`, unlayered,
          // which outranks a Tailwind utility whatever its specificity.
          <div className="text-primary! text-[13px] mt-[4px]">
            {t("Ver en el mapa")}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <DataCard message={message} direction={direction}>
      {/* The whole card opens the map, as it does in WhatsApp. */}
      {link ? (
        <a href={link} target="_blank" rel="noopener noreferrer">
          {card}
        </a>
      ) : (
        card
      )}
    </DataCard>
  );
}
