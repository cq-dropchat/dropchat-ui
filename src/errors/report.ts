// E1. Sends a browser error to public.error_issues (see the api repo's
// 03-22_errors.sql). The database does the grouping, the counting and the
// baseline; this file's whole job is to notice, describe and not make things
// worse.
//
// Before this, every error in the UI died in one of three places: the console,
// a `useState` in one screen, or the full-page RouteError fallback. None of
// them leave a trace, so a bug a person hits on Tuesday is a bug nobody can
// look at on Wednesday.
import { supabase } from "@/supabase/client";

/** The build this tab is running (vite.config.ts injects it). */
const RELEASE = import.meta.env.VITE_RELEASE || undefined;

// Reporting is best-effort, and the cheapest way for it to become a problem is
// a render loop that fires the same error hundreds of times a second. The
// database would collapse those into one row, but only after answering a few
// hundred requests, so the throttle lives here too.
const SAME_ERROR_EVERY_MS = 60_000;
const MAX_PER_SESSION = 25;

const lastSent = new Map<string, number>();
let sentThisSession = 0;

/**
 * Errors that are never ours and never actionable.
 *
 * "Script error." is what the browser reports for a throw inside a
 * cross-origin script — a browser extension, an ad blocker rewriting the page
 * — with the message and stack stripped for security. There is nothing to fix
 * and nothing to read.
 *
 * The ResizeObserver line is a benign browser notice that the observer skipped
 * a frame; it is fired by ordinary layout, breaks nothing, and is the single
 * most common piece of noise in any browser error feed.
 */
function isNoise(message: string): boolean {
  return (
    message === "Script error." ||
    message === "Script error" ||
    message.startsWith("ResizeObserver loop")
  );
}

/**
 * The route, with its ids replaced — "/conversations/:id", not
 * "/conversations/9f2c…". Without this every conversation that hit the same
 * bug would be its own issue, which is the fragmentation the fingerprint
 * exists to prevent.
 */
export function routeShape(pathname: string): string {
  return pathname
    .split("/")
    .map((segment) => {
      if (
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          segment,
        )
      ) {
        return ":id";
      }
      if (/^\d+$/.test(segment)) return ":n";
      return segment;
    })
    .join("/");
}

function describe(error: unknown): {
  kind: string;
  message: string;
  stack?: string;
} {
  if (error instanceof Error) {
    return {
      kind: error.name || "Error",
      message: error.message,
      stack: error.stack,
    };
  }

  // A throw of something that is not an Error — a string, a Supabase
  // `{ message, code }`, a rejected fetch. Not rare enough to ignore.
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const message =
      typeof record.message === "string" ? record.message : undefined;
    if (message) {
      return {
        kind: typeof record.name === "string" ? record.name : "Error",
        message,
        stack: typeof record.stack === "string" ? record.stack : undefined,
      };
    }
  }

  return { kind: "Error", message: String(error) };
}

/**
 * Never throws and never awaits anything the caller depends on: this runs
 * inside error handlers and error boundaries, where a second failure has
 * nowhere to go.
 */
export function reportError(
  error: unknown,
  context: Record<string, unknown> = {},
): void {
  try {
    const { kind, message, stack } = describe(error);
    if (!message || isNoise(message)) return;

    const culprit = routeShape(window.location.pathname);
    const key = `${kind}|${message}|${culprit}`;
    const now = Date.now();

    if (sentThisSession >= MAX_PER_SESSION) return;
    if (now - (lastSent.get(key) ?? 0) < SAME_ERROR_EVERY_MS) return;

    lastSent.set(key, now);
    sentThisSession += 1;

    // Deliberately no query string and no hash. Both can carry an OAuth code
    // or an access token (the PKCE callback puts one there), and an error
    // report is not a place to keep credentials. The path is what identifies
    // the screen; the rest is secrets and noise.
    void supabase
      .rpc("report_error", {
        _kind: kind,
        _message: message,
        _culprit: culprit,
        _stack: stack,
        _release: RELEASE,
        _context: {
          ...context,
          path: window.location.pathname,
          user_agent: navigator.userAgent,
          language: navigator.language,
        },
      })
      // The reporter stays silent when reporting fails: the console already
      // has the original error, and a toast about telemetry helps nobody.
      .then(
        () => undefined,
        () => undefined,
      );
  } catch {
    // Same reason.
  }
}

/**
 * The two errors React never sees: a throw outside the component tree (an
 * event handler, a timer, a module) and a promise nobody caught. Between them
 * and the two error boundaries, everything that goes wrong is accounted for.
 */
export function installErrorReporting(): void {
  window.addEventListener("error", (event) => {
    // A failed <img>/<script> load also fires `error` on the element and
    // bubbles here with no `error` property. Those are network facts, not
    // crashes.
    if (!event.error && !event.message) return;
    reportError(event.error ?? event.message, { via: "window.onerror" });
  });

  window.addEventListener("unhandledrejection", (event) => {
    reportError(event.reason, { via: "unhandledrejection" });
  });
}

/** Test seam: the throttle is module state and outlives a single test. */
export function resetErrorReportingForTests(): void {
  lastSent.clear();
  sentThisSession = 0;
}
