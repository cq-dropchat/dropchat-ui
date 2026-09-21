import { expect, test } from "@playwright/test";

// Credentials from the API repo's seed.sql (local development only).
const EMAIL = "goat@craft.com";
const PASSWORD = "goat";

test("login with email, open a conversation, send a text, see it listed", async ({
  page,
}) => {
  // `?email=1` reveals the email/password form (OAuth buttons are the default).
  await page.goto("/login?email=1");

  await page.getByPlaceholder("gori@gmail.com").fill(EMAIL);
  await page.getByPlaceholder("******").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();

  await expect(page).not.toHaveURL(/\/login/);

  // `goat` belongs to TWO seeded organizations and only Mountain Peaks has
  // the conversation below, so the test picks it instead of trusting whichever
  // one the app opens on. By role and not by text: the active organization's
  // name is also the conversation list's heading, so plain text matches twice
  // the moment the one being picked is already active.
  await page.getByTestId("user-menu").click();
  await page.getByRole("menuitem", { name: "Mountain Peaks" }).click();

  // By the contact's name, not the conversation's. The list shows the nearest
  // name it has (ChatListItem.tsx: address book, then Instagram handle, then
  // `conversations.name` last), and the address book calls this one Dolphin.
  // "Map trade" is the row's own name and appears only in the window before
  // the contacts query answers — which is to say this line used to pass by
  // winning a race, and lost it as soon as the organization stopped changing
  // underneath it and emptying the store.
  await page.getByText("Dolphin").first().click();
  await expect(page).toHaveURL(/#/);

  const text = `e2e ${Date.now()}`;
  const composer = page.locator("[contenteditable=true]").first();
  await composer.click();
  await composer.fill(text);
  await composer.press("Enter");

  // The optimistic insert lands in the store via PostgREST + Realtime; the
  // bubble and the list preview both show the text.
  await expect(page.getByText(text).first()).toBeVisible({ timeout: 15_000 });
});
