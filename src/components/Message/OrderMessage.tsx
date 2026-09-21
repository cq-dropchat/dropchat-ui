import { ShoppingBag } from "lucide-react";
import DataCard from "./DataCard";
import { useTranslation } from "@/hooks/useTranslation";
import type { Direction, MessageRow } from "@/supabase/client";
import type { Order } from "@/supabase/types/whatsapp_webhook_message_types";

/**
 * A cart someone sent from the catalog, as a card: the items, what each one
 * costs, and what it adds up to.
 *
 * Before this the whole order was dumped as JSON into the conversation, which
 * is precisely the row where a person has to read numbers and act on them.
 */

/** An amount in its own currency, falling back to the plain figure. */
export function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
    }).format(amount);
  } catch {
    // A currency code this browser does not know, or none at all.
    return currency ? `${amount} ${currency}` : String(amount);
  }
}

/**
 * A figure the order states, as a number — or nothing.
 *
 * `Number("")` is 0, which would quietly turn a missing price into a free
 * item and a wrong total; an absent figure has to stay absent.
 */
function number(value: string | undefined): number | undefined {
  if (!value?.trim()) return undefined;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * What the order comes to, when it can be said at all: a cart whose lines
 * are priced in different currencies has no single total, and neither does
 * one whose prices did not parse.
 */
export function orderTotal(
  items: Order["product_items"] | undefined,
): { amount: number; currency: string } | undefined {
  if (!items?.length) return undefined;

  const currency = items[0].currency;
  if (items.some((item) => item.currency !== currency)) return undefined;

  let amount = 0;

  for (const item of items) {
    const price = number(item.item_price);
    const quantity = number(item.quantity);

    if (price === undefined || quantity === undefined) return undefined;

    amount += price * quantity;
  }

  return { amount, currency };
}

export default function OrderMessage({
  message,
  direction,
}: {
  message: MessageRow;
  direction: Direction;
}) {
  const { translate: t } = useTranslation();

  const content = message.content;

  if (content.type !== "data" || content.kind !== "order") {
    throw new Error(`Message with id ${message.id} is not an order.`);
  }

  const items = content.data?.product_items ?? [];
  const total = orderTotal(items);

  return (
    <DataCard message={message} direction={direction}>
      <div data-testid="order-card">
        <div className="flex items-center">
          <ShoppingBag className="h-[22px] w-[22px] shrink-0 text-muted-foreground" />
          <div className="ml-[10px]">
            {t("Pedido")}
            <span className="text-muted-foreground text-[12px] ml-[6px]">
              {items.length}{" "}
              {items.length === 1 ? t("producto") : t("productos")}
            </span>
          </div>
        </div>

        {items.length > 0 && (
          <div className="mt-[10px] border-t border-border pt-[8px] text-[13px]">
            {items.map((item, idx) => {
              const price = number(item.item_price);

              return (
                <div
                  key={`${item.product_retailer_id}-${idx}`}
                  className="flex justify-between gap-[10px] py-[2px]"
                >
                  {/* The catalog reference is all the order carries; the
                      product's name lives in the catalog, which we do not
                      read here. */}
                  <span className="truncate">{item.product_retailer_id}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {item.quantity} ×{" "}
                    {price === undefined
                      ? item.item_price
                      : money(price, item.currency)}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {total && (
          <div className="mt-[8px] border-t border-border pt-[8px] flex justify-between text-[13px]">
            <span className="text-muted-foreground">{t("Total")}</span>
            <span className="font-semibold">
              {money(total.amount, total.currency)}
            </span>
          </div>
        )}
      </div>
    </DataCard>
  );
}
