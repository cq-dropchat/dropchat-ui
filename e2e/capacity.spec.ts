import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
const enabled = process.env.DROPCHAT_CAPACITY === "1";
test.skip(
  !enabled,
  "Dedicated sixty-minute local capacity profile; run separately from functional gates",
);
const ORG = "aaaaaaaa-0000-4000-8000-000000000001";
const id = (n: number) =>
  `e3000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
test("D3: 5k then 50k conversations, real 100 DB events/s and a sixty-minute browser session", async ({
  page,
  context,
}) => {
  test.setTimeout(3_800_000);
  const status = JSON.parse(
    execFileSync("supabase", ["status", "-o", "json"], {
      cwd: path.resolve(process.env.API_REPO_DIR || "../api"),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }),
  );
  const admin = createClient(
    "http://127.0.0.1:54321",
    status.SERVICE_ROLE_KEY,
    { auth: { persistSession: false } },
  );
  const sql = (query: string) =>
    execFileSync(
      "docker",
      [
        "exec",
        "-i",
        "supabase_db_open-bsp-api",
        "psql",
        "-U",
        "postgres",
        "-d",
        "postgres",
        "-qAt",
        "-v",
        "ON_ERROR_STOP=1",
      ],
      { input: query, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
    );
  const fixture = (start: number, end: number) =>
    sql(
      `begin;set local session_replication_role=replica;insert into public.conversations(id,organization_id,service,organization_address,address,name) select ('e3000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'${ORG}','whatsapp','100000000000001','capacity-'||n,'Capacity '||n from generate_series(${start},${end})n on conflict do nothing;
insert into public.messages(id,organization_id,conversation_id,service,organization_address,conversation_address,sender_address,external_id,content,status,timestamp)
select ('e3000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'${ORG}',('e3000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'whatsapp','100000000000001','capacity-'||n,'capacity-'||n,'capacity-'||n,'{"version":"1","type":"text","kind":"text","text":"capacity"}','{"delivered":"2026-10-01T00:00:00Z"}',now()-interval '1 hour' from generate_series(${start},${end})n on conflict do nothing;
commit;analyze public.conversations;analyze public.messages;`,
    );
  let stop = false,
    writes = 0,
    offered = 0,
    writeError: unknown;
  const samples: Record<string, unknown>[] = [];
  let volume = 5000;
  const durationSeconds = Number(process.env.DROPCHAT_CAPACITY_SECONDS || 3600);
  if (
    !Number.isFinite(durationSeconds) ||
    durationSeconds < 30 ||
    durationSeconds > 3600
  )
    throw new Error(
      "Capacity duration must be 30..3600 seconds; only 3600 is acceptance",
    );
  const socketCounts: Record<string, number> = {};
  const browserErrors: string[] = [];
  const protocolErrors: unknown[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  let joined = false;
  page.on("websocket", (socket) =>
    socket.on("framereceived", ({ payload }) => {
      try {
        const frame = JSON.parse(String(payload));
        if (frame.event === "system" && protocolErrors.length < 10)
          protocolErrors.push(frame.payload);
        const frameKey = `${frame.event}:${frame.payload?.data?.table || "protocol"}`;
        socketCounts[frameKey] = (socketCounts[frameKey] || 0) + 1;
        if (
          frame.event === "phx_reply" &&
          frame.payload?.status === "ok" &&
          (frame.topic === `realtime:org:${ORG}` ||
            frame.payload?.response?.postgres_changes?.some(
              (c: { filter?: string }) =>
                c.filter === `organization_id=eq.${ORG}`,
            ))
        )
          joined = true;
      } catch {
        /* Ignore protocol heartbeats without JSON. */
      }
    }),
  );
  const metrics = await context.newCDPSession(page);
  await metrics.send("Performance.enable");
  try {
    fixture(1, 5000);
    await page.addInitScript(() => {
      let count = 0,
        total = 0,
        max = 0;
      new PerformanceObserver((list) => {
        for (const task of list.getEntries()) {
          count++;
          total += task.duration;
          max = Math.max(max, task.duration);
        }
      }).observe({ type: "longtask", buffered: true });
      Object.assign(window, {
        capacityTasks: () => ({ count, total_ms: total, max_ms: max }),
      });
    });
    await page.goto("/login?email=1");
    await page.getByPlaceholder("gori@gmail.com").fill("alice@test.local");
    await page.getByPlaceholder("******").fill("alice");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).not.toHaveURL(/\/login/);
    await page.getByTestId("user-menu").click();
    await page.getByRole("menuitem", { name: "Alpha", exact: true }).click();
    await expect.poll(() => joined, { timeout: 15000 }).toBe(true);
    await expect(
      page.getByText("Capacity 5000", { exact: true }).first(),
    ).toBeVisible();
    // Join ACK precedes CDC readiness. Prove both subscriptions with a real write.
    await admin
      .from("conversations")
      .update({ extra: { capacity_probe: true } })
      .eq("id", id(5000))
      .throwOnError();
    await admin
      .from("messages")
      .update({ status: { read: new Date().toISOString() } })
      .eq("id", id(5000))
      .throwOnError();
    await expect
      .poll(() => socketCounts["postgres_changes:conversations"] || 0, {
        timeout: 15000,
      })
      .toBeGreaterThan(0);
    await expect
      .poll(() => socketCounts["postgres_changes:messages"] || 0, {
        timeout: 15000,
      })
      .toBeGreaterThan(0);
    const started = Date.now();
    let latest = 5000;
    const writer = (async () => {
      let tick = 0;
      while (!stop) {
        const target = started + tick * 1000;
        const delay = target - Date.now();
        if (delay > 0) await new Promise((r) => setTimeout(r, delay));
        if (stop) break;
        const ids = Array.from({ length: 50 }, (_, i) =>
          id(1 + ((4950 + tick * 50 + i) % volume)),
        );
        offered += 100;
        const writtenLatest = 1 + ((4950 + tick * 50 + 49) % volume);
        try {
          const changes = await Promise.all([
            admin
              .from("conversations")
              .update({ extra: { capacity_tick: tick } })
              .eq("organization_id", ORG)
              .in("id", ids)
              .select("id")
              .throwOnError(),
            admin
              .from("messages")
              .update({ status: { read: new Date().toISOString() } })
              .eq("organization_id", ORG)
              .in("id", ids)
              .select("id")
              .throwOnError(),
          ]);
          expect(changes.map((result) => result.data.length)).toEqual([50, 50]);
          writes += changes.reduce(
            (count, result) => count + result.data.length,
            0,
          );
          latest = writtenLatest;
        } catch (error) {
          writeError = error;
          stop = true;
          break;
        }
        tick++;
      }
    })();
    try {
      while (Date.now() - started < durationSeconds * 1000) {
        if (Date.now() - started >= 600_000 && volume === 5000) {
          fixture(5001, 50000);
          volume = 50000;
        }
        if (writeError) throw writeError;
        const name = `Capacity ${latest}`;
        const input = page.getByPlaceholder("Buscar");
        const searchStart = Date.now();
        await input.fill(name);
        await expect(page.getByTestId("inbox-list")).toHaveAttribute(
          "data-search-pattern",
          name,
        );
        await expect(page.getByText(name, { exact: true }).first()).toBeVisible(
          { timeout: 10_000 },
        );
        const searchMs = Date.now() - searchStart;
        await page.getByText(name, { exact: true }).first().click();
        await expect(page.getByTestId("chat-history")).toBeVisible();
        const profile = await metrics.send("Performance.getMetrics");
        const heap = profile.metrics.find(
          (m) => m.name === "JSHeapUsedSize",
        )?.value;
        samples.push({
          elapsed_s: (Date.now() - started) / 1000,
          db_conversations: volume,
          inbox: Number(
            await page
              .getByTestId("inbox-list")
              .getAttribute("data-inbox-count"),
          ),
          window: Number(
            await page
              .getByTestId("chat-history")
              .getAttribute("data-history-count"),
          ),
          search_ms: searchMs,
          heap_bytes: heap,
          long_tasks: await page.evaluate(() =>
            (
              window as unknown as { capacityTasks: () => unknown }
            ).capacityTasks(),
          ),
          offered,
          writes,
        });
        expect(samples.at(-1)!.window as number).toBeLessThanOrEqual(1000);
        mkdirSync("artifacts/capacity", { recursive: true });
        writeFileSync(
          "artifacts/capacity/browser-progress.json",
          JSON.stringify(
            {
              offered,
              writes,
              socketCounts,
              protocolErrors,
              browserErrors,
              samples,
            },
            null,
            2,
          ),
        );
        await input.fill("");
        await new Promise((r) => setTimeout(r, 5000));
      }
    } finally {
      stop = true;
      await writer;
    }
    mkdirSync("artifacts/capacity", { recursive: true });
    writeFileSync(
      "artifacts/capacity/browser.json",
      JSON.stringify(
        {
          duration_s: (Date.now() - started) / 1000,
          mode: process.env.VITE_REALTIME_MODE || "postgres_changes",
          requested_duration_s: durationSeconds,
          qualification:
            durationSeconds === 3600
              ? "ten minutes at 5k, fifty at 50k; provisional local profile, not observed production peak"
              : "short wiring diagnostic at 5k; does not validate 50k or sustained capacity",
          offered,
          writes,
          samples,
        },
        null,
        2,
      ),
    );
  } finally {
    stop = true;
    mkdirSync("artifacts/capacity", { recursive: true });
    writeFileSync(
      "artifacts/capacity/browser-diagnostics.json",
      JSON.stringify(
        {
          socketCounts,
          protocolErrors,
          browserErrors,
          offered,
          writes,
          samples,
        },
        null,
        2,
      ),
    );
    sql(
      `begin;set local session_replication_role=replica;delete from public.messages where organization_id='${ORG}' and id::text like 'e3000000-%';delete from public.conversations where organization_id='${ORG}' and id::text like 'e3000000-%';commit;`,
    );
  }
});
