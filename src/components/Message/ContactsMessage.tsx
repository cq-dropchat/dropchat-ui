import Avatar from "@/components/Avatar";
import DataCard from "./DataCard";
import { useTranslation } from "@/hooks/useTranslation";
import { formatPhoneNumber, nameInitials } from "@/utils/FormatUtils";
import type { Direction, MessageRow } from "@/supabase/client";
import type { Contact } from "@/supabase/types/whatsapp_webhook_message_types";

/**
 * A contact card someone shared: who it is and how to reach them.
 *
 * A contacts part carries an array — WhatsApp lets you send several at once —
 * so the card is a small list, each entry the way the address book shows one.
 */
function phones(contact: Contact | undefined): string[] {
  return (contact?.phones ?? [])
    .map((phone) => phone.phone)
    .filter((phone): phone is string => !!phone);
}

export default function ContactsMessage({
  message,
  direction,
}: {
  message: MessageRow;
  direction: Direction;
}) {
  const { translate: t } = useTranslation();

  const content = message.content;

  if (content.type !== "data" || content.kind !== "contacts") {
    throw new Error(`Message with id ${message.id} is not a contacts part.`);
  }

  const contacts = content.data ?? [];

  return (
    <DataCard message={message} direction={direction}>
      <div data-testid="contacts-card">
        {contacts.map((contact, idx) => {
          const name = contact?.name?.formatted_name || t("Contacto");

          return (
            <div
              key={idx}
              className={
                "flex items-start" +
                (idx > 0 ? " mt-[10px] border-t border-border pt-[10px]" : "")
              }
            >
              <Avatar
                fallback={nameInitials(name)}
                size={36}
                className="bg-background text-foreground border border-border text-[13px] shrink-0"
              />

              <div className="ml-[10px] grow min-w-0">
                <div className="break-words">{name}</div>

                {/* A shared contact may carry several numbers, and may carry
                    none — the name is the card either way. */}
                {phones(contact).map((phone) => (
                  <div
                    key={phone}
                    className="text-muted-foreground py-[2px] text-[12px]"
                  >
                    {formatPhoneNumber(phone)}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </DataCard>
  );
}
