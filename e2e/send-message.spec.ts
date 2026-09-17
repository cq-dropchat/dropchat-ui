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

  // The seeded conversation "Map trade" belongs to Mountain Peaks, the
  // signed-in user's org.
  await page.getByText("Map trade").first().click();
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
