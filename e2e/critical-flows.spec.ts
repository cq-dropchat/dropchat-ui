import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { existsSync } from "node:fs";

const url = process.env.VITE_SUPABASE_URL || "http://127.0.0.1:54321";
if (!/^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(url))
  throw new Error("Critical E2E fixtures require the disposable local stack");
const status = JSON.parse(
  execFileSync("supabase", ["status", "-o", "json"], {
    cwd: path.resolve(process.env.API_REPO_DIR || "../api"),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }),
) as { SERVICE_ROLE_KEY: string };
const admin = createClient(url, status.SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const ORG = "aaaaaaaa-0000-4000-8000-000000000001";
const FOREIGN = "bbbbbbbb-0000-4000-8000-000000000001";
const ADDRESS = "100000000000001";
let conv: string;
let label: string;
let ids: string[];

async function login(page: Page) {
  await page.goto("/login?email=1");
  await page.getByPlaceholder("gori@gmail.com").fill("alice@test.local");
  await page.getByPlaceholder("******").fill("alice");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).not.toHaveURL(/\/login/);
  await page.getByRole("button", { name: /user/i }).count();
  await page.getByTestId("user-menu").click();
  await page.getByRole("menuitem", { name: "Alpha", exact: true }).click();
  await page.goto(`/conversations#${conv}`);
  await expect(page.getByTestId("chat-history")).toHaveAttribute(
    "data-history-count",
    "50",
  );
}
function historyResponse(page: Page, newer = false) {
  return page.waitForResponse((response) => {
    const u = new URL(response.url());
    return (
      u.pathname.endsWith("/messages") &&
      u.searchParams.get("conversation_id") === `eq.${conv}` &&
      u.searchParams
        .get("order")
        ?.includes(newer ? "timestamp.asc" : "timestamp.desc") === true
    );
  });
}
async function older(page: Page) {
  const response = historyResponse(page);
  await page
    .getByRole("button", { name: "Cargar mensajes anteriores", exact: true })
    .click();
  const rows = (await (await response).json()) as {
    id: string;
    content: { text: string };
  }[];
  await expect(
    page.getByRole("button", { name: "Cargando...", exact: true }),
  ).toHaveCount(0);
  return rows;
}

async function anchor(page: Page, newer = false) {
  const box = page.getByTestId("chat-history");
  return box.evaluate(async (el, recent) => {
    const frame = () =>
      new Promise<void>((r) => requestAnimationFrame(() => r()));
    await frame();
    await frame();
    el.scrollTop = recent ? el.scrollHeight - el.clientHeight - 200 : 200;
    // Virtual rows measure after scroll. Capture the settled reader position.
    await frame();
    await frame();
    const top = el.getBoundingClientRect().top;
    const row = [...el.querySelectorAll<HTMLElement>("[data-message-id]")].find(
      (r) =>
        r.getBoundingClientRect().bottom > top &&
        r.getBoundingClientRect().top < top + el.clientHeight,
    )!;
    return {
      id: row.dataset.messageId!,
      y: row.getBoundingClientRect().top - top,
    };
  }, newer);
}
async function expectAnchor(page: Page, saved: { id: string; y: number }) {
  await expect
    .poll(() =>
      page.getByTestId("chat-history").evaluate((el, a) => {
        const row = el.querySelector<HTMLElement>(
          `[data-message-id="${a.id}"]`,
        );
        return row
          ? Math.abs(
              row.getBoundingClientRect().top -
                el.getBoundingClientRect().top -
                a.y,
            )
          : Infinity;
      }, saved),
    )
    .toBeLessThan(12);
}

test.beforeEach(async () => {
  conv = randomUUID();
  label = `History ${conv}`;
  ids = Array.from(
    { length: 1600 },
    (_, i) =>
      `${conv.slice(0, 8)}-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
  );
  await admin
    .from("conversations")
    .insert({
      id: conv,
      organization_id: ORG,
      service: "whatsapp",
      organization_address: ADDRESS,
      address: conv,
      name: label,
    })
    .throwOnError();
  const rows = ids.map((id, i) => ({
    id,
    organization_id: ORG,
    conversation_id: conv,
    service: "whatsapp",
    organization_address: ADDRESS,
    conversation_address: conv,
    sender_address: conv,
    external_id: `${conv}-${i}`,
    content: {
      version: "1",
      type: "text",
      kind: "text",
      text: `history-${String(i + 1).padStart(4, "0")}`,
    },
    timestamp: new Date(
      Date.UTC(2026, 9, 1) + Math.floor(i / 10) * 1000,
    ).toISOString(),
  }));
  await admin.from("messages").insert(rows).throwOnError();
});
test.afterEach(async () => {
  // Message deletion does not cascade record_id in the durable queue. Remove
  // only this fixture's calls so later suites are not starved by orphan work.
  await admin
    .from("edge_calls")
    .delete()
    .eq("organization_id", ORG)
    .eq("payload->record->>conversation_id", conv)
    .throwOnError();
  await admin
    .from("messages")
    .delete()
    .eq("organization_id", ORG)
    .eq("conversation_id", conv)
    .throwOnError();
  await admin
    .from("conversations")
    .delete()
    .eq("organization_id", ORG)
    .eq("id", conv)
    .throwOnError();
});

test("B1: all 1600 tied IDs are accessible through a bounded bidirectional history", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const seen = new Set<string>();
  page.on("response", (response) => {
    const u = new URL(response.url());
    if (
      u.pathname.endsWith("/messages") &&
      u.searchParams.get("conversation_id") === `eq.${conv}` &&
      response.ok()
    )
      void response.json().then((rows: { id: string }[]) => {
        for (const row of rows) seen.add(row.id);
      });
  });
  await login(page);
  for (let i = 0; i < 31; i++) {
    const saved = [0, 19, 25].includes(i) ? await anchor(page) : null;
    const rows = await older(page);
    if (saved) await expectAnchor(page, saved);
    expect(rows.map((r) => r.id)).toEqual(
      [...ids].reverse().slice((i + 1) * 50, (i + 2) * 50),
    );
    expect(rows.every((r) => r.content.text.startsWith("history-"))).toBe(true);
    expect(
      Number(
        await page
          .getByTestId("chat-history")
          .getAttribute("data-history-count"),
      ),
    ).toBeLessThanOrEqual(1000);
  }
  await expect.poll(() => seen.size).toBe(1600);
  // Inbox preview stays at the latest message even when the active window is old.
  const inboxRow = page
    .getByTestId("inbox-list")
    .locator("[data-index]")
    .filter({ has: page.getByText(label, { exact: true }) });
  await expect(
    inboxRow.getByText("history-1600", { exact: true }),
  ).toBeVisible();
  for (let i = 0; i < 13; i++) {
    const response = historyResponse(page, true);
    await page
      .getByRole("button", { name: "Cargar mensajes recientes", exact: true })
      .click();
    await response;
    await expect(
      page.getByRole("button", { name: "Cargando...", exact: true }),
    ).toHaveCount(0);
  }
  expect(
    Number(
      await page.getByTestId("chat-history").getAttribute("data-history-count"),
    ),
  ).toBeLessThanOrEqual(1000);
  await test.info().attach("history.json", {
    body: JSON.stringify({
      fixture: ids.length,
      accessible: seen.size,
      duplicates: 0,
      window: 1000,
    }),
    contentType: "application/json",
  });
});

for (const newer of [false, true])
  test(`B2: ${newer ? "newer" : "older"} page failure preserves cursor, window and anchor`, async ({
    page,
  }) => {
    await login(page);
    if (newer) for (let i = 0; i < 20; i++) await older(page);
    const saved = await anchor(page, newer);
    const before = await page
      .getByTestId("chat-history")
      .getAttribute("data-history-count");
    let allowRetry = false;
    let failedCursor: string | null = null;
    let successfulCursor: string | null = null;
    await page.route("**/rest/v1/messages?**", async (route) => {
      const u = new URL(route.request().url());
      if (
        u.searchParams.get("conversation_id") === `eq.${conv}` &&
        u.searchParams.has("or") &&
        u.searchParams
          .get("order")
          ?.includes(newer ? "timestamp.asc" : "timestamp.desc")
      ) {
        if (!allowRetry) {
          failedCursor = u.searchParams.get("or");
          await route.fulfill({
            status: 503,
            contentType: "application/json",
            body: JSON.stringify({
              code: "injected",
              message: "temporary page error",
            }),
          });
          return;
        }
        successfulCursor = u.searchParams.get("or");
      }
      await route.continue();
    });
    await page
      .getByRole("button", {
        name: newer
          ? "Cargar mensajes recientes"
          : "Cargar mensajes anteriores",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("button", { name: "Reintentar", exact: true }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("chat-history")).toHaveAttribute(
      "data-history-count",
      before!,
    );
    await expectAnchor(page, saved);
    allowRetry = true;
    const retried = historyResponse(page, newer);
    await page.getByRole("button", { name: "Reintentar", exact: true }).click();
    await retried;
    await expect(page.getByTestId("chat-history")).toHaveAttribute(
      "data-history-count",
      newer ? "1000" : "100",
    );
    await test.info().attach("retry-geometry.json", {
      body: JSON.stringify(
        await page.getByTestId("chat-history").evaluate(
          (el, saved) => ({
            saved,
            top: el.scrollTop,
            height: el.scrollHeight,
            client: el.clientHeight,
            rows: [
              ...el.querySelectorAll<HTMLElement>("[data-message-id]"),
            ].map((r) => ({
              id: r.dataset.messageId,
              y: r.getBoundingClientRect().top - el.getBoundingClientRect().top,
            })),
          }),
          saved,
        ),
      ),
      contentType: "application/json",
    });
    await expectAnchor(page, saved);
    expect(successfulCursor).toBe(failedCursor);
  });

test("B3: visible reconnection converges with a message written by another client", async ({
  page,
  context,
}) => {
  await page.addInitScript(() => {
    const sockets: WebSocket[] = [];
    const Original = window.WebSocket;
    window.WebSocket = class extends Original {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        sockets.push(this);
      }
    };
    Object.assign(window, {
      closeTestSockets: () => {
        for (const socket of sockets) socket.close();
      },
    });
  });
  await login(page);
  await context.setOffline(true);
  await page.evaluate(() => {
    (window as unknown as { closeTestSockets: () => void }).closeTestSockets();
  });
  const id = randomUUID();
  await admin
    .from("messages")
    .insert({
      id,
      organization_id: ORG,
      conversation_id: conv,
      service: "whatsapp",
      organization_address: ADDRESS,
      conversation_address: conv,
      sender_address: conv,
      external_id: `${conv}-reconnected`,
      content: {
        version: "1",
        type: "text",
        kind: "text",
        text: "visible-reconnection",
      },
    })
    .throwOnError();
  const started = Date.now();
  await context.setOffline(false);
  await expect(
    page.getByText("visible-reconnection", { exact: true }).first(),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("chat-history")).toHaveAttribute(
    "data-history-count",
    /^(50|51)$/,
  );
  await test.info().attach("reconnection.json", {
    body: JSON.stringify({
      recovery_ms: Date.now() - started,
      visible: true,
      message_id: id,
    }),
    contentType: "application/json",
  });
});

test("B5: a delayed tenant A response cannot populate tenant B", async ({
  page,
}) => {
  const user = "aaaaaaaa-0000-4000-8000-0000000000a1";
  const { data: original } = await admin
    .from("agents")
    .select()
    .eq("organization_id", FOREIGN)
    .eq("user_id", user)
    .maybeSingle()
    .throwOnError();
  const membership = original?.id ?? randomUUID();
  if (original)
    await admin
      .from("agents")
      .update({ deleted_at: null })
      .eq("id", membership)
      .throwOnError();
  else
    await admin
      .from("agents")
      .insert({
        id: membership,
        organization_id: FOREIGN,
        user_id: user,
        name: "Alice test",
        role: "member",
      })
      .throwOnError();
  try {
    await login(page);
    let pending: (() => void) | undefined;
    let delayed = false;
    await page.route("**/rest/v1/rpc/init_data", async (route) => {
      const body = route.request().postDataJSON() as {
        p_organization_id: string;
      };
      if (body.p_organization_id === ORG && !delayed) {
        delayed = true;
        const response = await route.fetch();
        await new Promise<void>((resolve) => {
          pending = resolve;
        });
        await route.fulfill({ response });
      } else await route.continue();
    });
    await page.reload();
    await expect.poll(() => !!pending).toBe(true);
    await page.getByTestId("user-menu").click();
    await page.getByRole("menuitem", { name: "Bravo", exact: true }).click();
    pending!();
    await expect(page.getByText(label, { exact: true })).toHaveCount(0);
    await page.getByTestId("user-menu").click();
    await page.getByRole("menuitem", { name: "Alpha", exact: true }).click();
    await page.unroute("**/rest/v1/rpc/init_data");
    await page.getByTestId("user-menu").click();
    await page
      .getByRole("menuitem", { name: "Cerrar sesión", exact: true })
      .click();
    await expect(page).toHaveURL(/\/login/);
    await login(page);
  } finally {
    if (original)
      await admin
        .from("agents")
        .update({ deleted_at: original.deleted_at })
        .eq("id", membership)
        .throwOnError();
    else
      await admin.from("agents").delete().eq("id", membership).throwOnError();
  }
});

test("B4: hidden recovery crosses ten pages and reloads the retained chat", async ({
  page,
  context,
}) => {
  test.setTimeout(180_000);
  await login(page);
  for (let i = 0; i < 20; i++) await older(page);
  const retained = await page.getByTestId("chat-history").evaluate((el) => {
    const bounds = el.getBoundingClientRect();
    return [...el.querySelectorAll<HTMLElement>("[data-message-id]")].find(
      (row) => {
        const rect = row.getBoundingClientRect();
        return rect.top >= bounds.top && rect.bottom <= bounds.bottom;
      },
    )?.dataset.messageId;
  });
  expect(retained).toBeTruthy();
  // Headless Chromium has no OS tab visibility; inject only that signal.
  // HTTP, DB, hooks, keyset cursors and cancellation all remain real.
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await context.setOffline(true);
  const { data: base } = await admin
    .from("messages")
    .select()
    .eq("id", ids[1549])
    .single()
    .throwOnError();
  for (let offset = 0; offset < 11_000; offset += 1000) {
    const rows = Array.from({ length: 1000 }, (_, i) => ({
      organization_id: ORG,
      conversation_id: conv,
      service: "whatsapp",
      organization_address: ADDRESS,
      conversation_address: conv,
      sender_address: conv,
      external_id: `${conv}-burst-${offset + i}`,
      content: {
        version: "1",
        type: "text",
        kind: "text",
        text: `burst-${offset + i}`,
      },
      timestamp: base.timestamp,
    }));
    await admin.from("messages").insert(rows).throwOnError();
  }
  await admin
    .from("messages")
    .update({ content: { text: "retained-chat-refreshed" } })
    .eq("id", retained!)
    .throwOnError();
  let catchPages = 0,
    reloads = 0;
  page.on("request", (request) => {
    const u = new URL(request.url());
    if (
      u.pathname.endsWith("/messages") &&
      u.searchParams.get("order") === "updated_at.asc,id.asc"
    )
      catchPages++;
    if (u.pathname.endsWith("/rpc/init_data")) reloads++;
  });
  await context.setOffline(false);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(
    page.getByText("retained-chat-refreshed", { exact: true }).first(),
  ).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => reloads).toBeGreaterThanOrEqual(1);
  expect(catchPages).toBeGreaterThanOrEqual(10);
  expect(
    Number(
      await page.getByTestId("chat-history").getAttribute("data-history-count"),
    ),
  ).toBeLessThanOrEqual(1000);
  await test.info().attach("recovery-budget.json", {
    body: JSON.stringify({
      changes: 11001,
      catchPages,
      reloads,
      visibility: "injected headless signal",
    }),
    contentType: "application/json",
  });
});

function backend(mode: string) {
  const api = path.resolve(process.env.API_REPO_DIR || "../api");
  const bundled =
    "/Users/cquezada/.npm/_npx/05b6ef7b13673c57/node_modules/deno/deno";
  const binary =
    process.env.DENO_BIN || (existsSync(bundled) ? bundled : "deno");
  const output = execFileSync(
    binary,
    [
      "run",
      "--config",
      path.join(api, "supabase/functions/deno.json"),
      "--allow-all",
      path.join(api, "supabase/tests/operational/critical_backend.ts"),
      mode,
      conv,
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  return JSON.parse(
    output
      .split("\n")
      .find((line) => line.startsWith("E2E_RESULT "))!
      .slice(11),
  ) as {
    audio?: string;
    document?: string;
    peak?: number;
    rows?: number;
    message_id?: string;
    llm_calls?: number;
    timeout_text?: string;
    expiry?: number;
    closed?: number;
    notified?: number;
    status?: { delivered?: string };
  };
}

test("B6: real webhook media worker preserves one failed reference and renders stored media", async ({
  page,
}) => {
  const result = backend("media");
  expect(result.rows).toBe(21);
  expect(result.peak).toBeLessThanOrEqual(4);
  await login(page);
  await expect(page.getByTestId("chat-history")).toHaveAttribute(
    "data-history-count",
    "50",
  );
  await expect
    .poll(() =>
      page
        .getByTestId("chat-history")
        .locator("img")
        .evaluateAll(
          (images) =>
            images.filter((img) => (img as HTMLImageElement).naturalWidth > 0)
              .length,
        ),
    )
    .toBeGreaterThan(0);
  const audio = page.locator(`[data-message-id="${result.audio}"]`);
  await audio.scrollIntoViewIfNeeded();
  await audio.locator("button").first().click();
  await expect(audio.locator('input[type="range"]')).toHaveAttribute(
    "max",
    "1",
  );
  await expect(page.getByText("fixture.txt", { exact: true })).toBeVisible();
  const { data: failed } = await admin
    .from("messages")
    .select("content,status")
    .eq("organization_id", ORG)
    .eq("conversation_id", conv)
    .eq("external_id", `wamid.browser.${conv}.3`)
    .single()
    .throwOnError();
  expect((failed.content as { file: { uri: string } }).file.uri).toBe(
    "media-3",
  );
  expect(failed.status.error).toBeTruthy();
  await test.info().attach("media-backend.json", {
    body: JSON.stringify(result),
    contentType: "application/json",
  });
});

test("B7/B8: human takeover blocks AI; real dispatcher retries and merges delivery/echo", async ({
  page,
}) => {
  // Open the provider's 24-hour window with a genuine DB inbound message.
  await admin
    .from("messages")
    .insert({
      organization_id: ORG,
      conversation_id: conv,
      service: "whatsapp",
      organization_address: ADDRESS,
      conversation_address: conv,
      sender_address: conv,
      external_id: `${conv}-live`,
      content: {
        version: "1",
        type: "text",
        kind: "text",
        text: "current inbound",
      },
    })
    .throwOnError();
  await login(page);
  await page.getByTestId("assignment-button").click();
  await page
    .getByRole("menuitem", { name: "Tomar conversación", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (
          await admin
            .from("conversations")
            .select("assigned_agent_id")
            .eq("id", conv)
            .single()
            .throwOnError()
        ).data.assigned_agent_id,
    )
    .toBe("aaaaaaaa-0000-4000-8000-00000000a0a1");
  expect(backend("attention").llm_calls).toBe(0);
  const text = `human reply ${conv}`;
  const composer = page.locator("[contenteditable=true]").first();
  await composer.fill(text);
  await composer.press("Enter");
  await expect(page.getByText(text, { exact: true }).first()).toBeVisible();
  const dispatched = backend("dispatch");
  expect(dispatched.rows).toBe(1);
  expect(dispatched.status?.delivered).toBeTruthy();
  await page.reload();
  await expect(page.getByText(text, { exact: true }).first()).toBeVisible();
  await page.getByTestId("assignment-button").click();
  await page
    .getByRole("menuitem", { name: "Dejar sin asignar", exact: true })
    .click();
  await expect(page.getByTestId("assignment-button")).toHaveText("Sin asignar");
  const lifecycle = backend("attention-lifecycle");
  expect([lifecycle.expiry, lifecycle.closed, lifecycle.notified]).toEqual([
    1, 0, 1,
  ]);
  await page.reload();
  await expect(
    page.getByText(lifecycle.timeout_text!, { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByTestId("assignment-button")).toHaveText(
    /Esperando humano/,
  );
  await test.info().attach("attention-lifecycle.json", {
    body: JSON.stringify(lifecycle),
    contentType: "application/json",
  });
  await test.info().attach("dispatch-backend.json", {
    body: JSON.stringify(dispatched),
    contentType: "application/json",
  });
});
