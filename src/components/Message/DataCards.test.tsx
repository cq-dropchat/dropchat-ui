// The structured parts a contact can send — a place, a cart, a contact card —
// rendered as cards.
//
// They used to fall through to the generic data branch and land in the
// conversation as the JSON they are stored as: a customer sharing their
// address showed up as `{"latitude":-33.44,…}`, and an order from the catalog
// as the whole cart object, on the one row where a person has to read numbers
// and act on them.
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import LocationMessage, { mapLink } from "./LocationMessage";
import OrderMessage, { orderTotal } from "./OrderMessage";
import ContactsMessage from "./ContactsMessage";
import { messageRow } from "@/test/factories";
import type { MessageRow } from "@/supabase/client";

vi.mock("@/hooks/useTranslation", () => ({
  useTranslation: () => ({ translate: (text: string) => text }),
}));

function data(kind: string, payload: unknown, text?: string): MessageRow {
  return messageRow({
    content: { version: "1", type: "data", kind, data: payload, text },
  } as unknown as Partial<MessageRow>);
}

describe("the location card", () => {
  const place = data("location", {
    name: "Oficina",
    address: "Av. Siempreviva 742",
    latitude: -33.44,
    longitude: -70.65,
  });

  it("shows the place instead of its coordinates object", () => {
    render(<LocationMessage message={place} direction="incoming" />);

    expect(screen.getByTestId("location-card")).toBeInTheDocument();
    expect(screen.getByText("Oficina")).toBeInTheDocument();
    expect(screen.getByText("Av. Siempreviva 742")).toBeInTheDocument();
    expect(screen.queryByText(/latitude/)).not.toBeInTheDocument();
  });

  it("links to the map, building the link when none was sent", () => {
    render(<LocationMessage message={place} direction="incoming" />);

    // The whole card is the link, as in WhatsApp.
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "https://www.google.com/maps/search/?api=1&query=-33.44,-70.65",
    );
    expect(screen.getByText("Ver en el mapa")).toBeInTheDocument();
  });

  it("keeps the link the connector sent", () => {
    expect(mapLink({ url: "https://maps.example/x" } as never)).toBe(
      "https://maps.example/x",
    );
  });

  it("refuses a url that is not http(s)", () => {
    // The url on an incoming part is text from outside, and an href is one of
    // the few places where that still executes.
    expect(
      mapLink({
        url: "javascript:alert(1)",
        latitude: 1,
        longitude: 2,
      } as never),
    ).toBe("https://www.google.com/maps/search/?api=1&query=1,2");
  });

  it("falls back to naming the row when there is nothing to name it with", () => {
    render(
      <LocationMessage
        message={data("location", { latitude: 1, longitude: 2 })}
        direction="incoming"
      />,
    );

    expect(screen.getByText("Ubicación")).toBeInTheDocument();
  });
});

describe("the order card", () => {
  const cart = data(
    "order",
    {
      catalog_id: "cat-1",
      product_items: [
        {
          product_retailer_id: "SKU-1",
          quantity: "2",
          item_price: "5000",
          currency: "CLP",
        },
        {
          product_retailer_id: "SKU-2",
          quantity: "1",
          item_price: "3000",
          currency: "CLP",
        },
      ],
      text: "",
    },
    "Lo necesito para el viernes",
  );

  it("lists the items and what they add up to", () => {
    render(<OrderMessage message={cart} direction="incoming" />);

    expect(screen.getByTestId("order-card")).toBeInTheDocument();
    expect(screen.getByText("SKU-1")).toBeInTheDocument();
    expect(screen.getByText("SKU-2")).toBeInTheDocument();
    expect(screen.getByText("2 productos")).toBeInTheDocument();
    expect(screen.getByText("Total")).toBeInTheDocument();
  });

  it("keeps the buyer's note, which used to replace the whole card", () => {
    // A data part carrying text used to short-circuit to a plain text bubble,
    // so an order with a note lost its items entirely.
    render(<OrderMessage message={cart} direction="incoming" />);

    expect(screen.getByText(/Lo necesito para el viernes/)).toBeInTheDocument();
    expect(screen.getByText("SKU-1")).toBeInTheDocument();
  });

  it("totals a cart priced in one currency", () => {
    expect(
      orderTotal([
        {
          product_retailer_id: "a",
          quantity: "2",
          item_price: "5000",
          currency: "CLP",
        },
        {
          product_retailer_id: "b",
          quantity: "1",
          item_price: "3000",
          currency: "CLP",
        },
      ]),
    ).toEqual({ amount: 13000, currency: "CLP" });
  });

  it("says no total where there is none to say", () => {
    // Mixed currencies do not add up, and neither does a price that is not a
    // number. Better no total than a wrong one.
    expect(
      orderTotal([
        {
          product_retailer_id: "a",
          quantity: "1",
          item_price: "5000",
          currency: "CLP",
        },
        {
          product_retailer_id: "b",
          quantity: "1",
          item_price: "10",
          currency: "USD",
        },
      ]),
    ).toBeUndefined();

    expect(
      orderTotal([
        {
          product_retailer_id: "a",
          quantity: "1",
          item_price: "",
          currency: "CLP",
        },
      ]),
    ).toBeUndefined();

    expect(orderTotal([])).toBeUndefined();
  });
});

describe("the contacts card", () => {
  it("shows every contact shared, with its numbers", () => {
    render(
      <ContactsMessage
        message={data("contacts", [
          {
            name: { formatted_name: "Ana Pérez" },
            phones: [{ phone: "56912345678", type: "CELL" }],
          },
          { name: { formatted_name: "Beto Soto" } },
        ])}
        direction="incoming"
      />,
    );

    expect(screen.getByTestId("contacts-card")).toBeInTheDocument();
    expect(screen.getByText("Ana Pérez")).toBeInTheDocument();
    expect(screen.getByText("Beto Soto")).toBeInTheDocument();
    expect(screen.getByText("+56 912345678")).toBeInTheDocument();
  });
});
