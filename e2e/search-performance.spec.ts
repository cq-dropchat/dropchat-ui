import { expect, test } from "@playwright/test";
import { readdirSync } from "node:fs";

test("searches 50,000 conversations in the production worker while the UI stays responsive", async ({
  page,
}) => {
  const file = readdirSync("dist/assets").find(
    (name) =>
      name.startsWith("conversationSearch.worker-") && name.endsWith(".js"),
  );
  expect(file).toBeTruthy();
  await page.goto("/login?email=1");
  const result = await page.evaluate(async (workerUrl) => {
    const worker = new Worker(workerUrl, { type: "module" });
    const items = Array.from({ length: 50000 }, (_, i) => ({
      id: String(i),
      name: `Customer ${i}`,
      address: String(i),
    }));
    let timerRan = false;
    const timer = setTimeout(() => {
      timerRan = true;
    }, 0);
    const started = performance.now();
    try {
      return await new Promise<{
        first: string;
        timerRan: boolean;
        milliseconds: number;
      }>((resolve, reject) => {
        worker.onerror = (event) => reject(new Error(event.message));
        worker.onmessage = ({
          data,
        }: MessageEvent<{ ids: { id: string }[] }>) =>
          resolve({
            first: data.ids[0].id,
            timerRan,
            milliseconds: performance.now() - started,
          });
        worker.postMessage({ items, pattern: "Customer 49999", requestId: 1 });
      });
    } finally {
      clearTimeout(timer);
      worker.terminate();
    }
  }, `/assets/${file}`);
  expect(result.first).toBe("49999");
  expect(result.timerRan).toBe(true);
  await test.info().attach("search-50000.json", {
    body: JSON.stringify(result),
    contentType: "application/json",
  });
});
