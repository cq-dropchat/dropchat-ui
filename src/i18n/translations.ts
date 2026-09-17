const cache = new Map<string, Record<string, string>>();

// F22: index.html starts the locale request inline, while the entry bundle
// downloads (see the script there). Its language detection mirrors
// main.tsx's; if the two ever disagree, the request is simply not reused.
type EarlyLocale = { lang: string; response: Promise<Response> };

function takeEarlyResponse(lang: string): Promise<Response> | undefined {
  const early = (globalThis as { __earlyLocale?: EarlyLocale }).__earlyLocale;
  if (early?.lang !== lang) return undefined;
  delete (globalThis as { __earlyLocale?: EarlyLocale }).__earlyLocale;
  return early.response;
}

// In-flight loads: main.tsx and the store's rehydration both ask for the
// language at startup, and used to download it twice.
const pending = new Map<string, Promise<void>>();

export function loadTranslations(lang: string): Promise<void> {
  if (lang === "es" || cache.has(lang)) return Promise.resolve();

  let load = pending.get(lang);
  if (!load) {
    load = fetchTranslations(lang).finally(() => pending.delete(lang));
    pending.set(lang, load);
  }
  return load;
}

async function fetchTranslations(lang: string): Promise<void> {
  let res = await takeEarlyResponse(lang)?.catch(() => undefined);
  if (!res?.ok) {
    res = await fetch(`/locales/${lang}.json`);
  }

  if (res.ok) {
    cache.set(lang, (await res.json()) as Record<string, string>);
  }
}

export function getTranslation(key: string, lang: string): string {
  if (lang === "es") return key;
  return cache.get(lang)?.[key] || key;
}
