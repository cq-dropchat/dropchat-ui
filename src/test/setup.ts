import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => {
  cleanup();
});

// jsdom lacks the layout/media APIs antd and the app touch at import time.

if (!window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

if (!window.ResizeObserver) {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  window.ResizeObserver =
    ResizeObserverStub as unknown as typeof ResizeObserver;
}

if (!window.IntersectionObserver) {
  class IntersectionObserverStub {
    readonly root = null;
    readonly rootMargin = "";
    readonly thresholds = [];
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  window.IntersectionObserver =
    IntersectionObserverStub as unknown as typeof IntersectionObserver;
}

if (!URL.createObjectURL) {
  URL.createObjectURL = vi.fn(() => "blob:test");
}
if (!URL.revokeObjectURL) {
  URL.revokeObjectURL = vi.fn();
}

// localStorage exists in jsdom; start each file from a known state. The
// persisted language is pinned to "es" (the source language) so the store's
// rehydration never fetches /locales/<lang>.json — a relative URL that Node's
// fetch rejects.
localStorage.clear();
localStorage.setItem(
  "app-state",
  JSON.stringify({ state: { ui: { language: "es" } }, version: 0 }),
);
