import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// Vitest runs without `globals: true`, so React Testing Library's automatic
// cleanup never registers itself. Without this, each test's DOM leaks into the
// next one and queries start matching elements from a previous render.
afterEach(cleanup);

// jsdom implements no layout engine: every element reports zero width, zero
// height, and an all-zero bounding box, and `ResizeObserver` doesn't exist at
// all. `@tanstack/react-virtual` uses exactly those to decide which rows are on
// screen, so the commit graph, diff, and blame views would render *nothing*
// under test — passing assertions about an empty list rather than about the
// component. Giving jsdom a plausible viewport makes the virtualized components
// testable without changing their behaviour.

const VIEWPORT_WIDTH = 1280;
const VIEWPORT_HEIGHT = 800;

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

for (const dimension of ["offsetHeight", "clientHeight"]) {
  Object.defineProperty(HTMLElement.prototype, dimension, {
    configurable: true,
    get() {
      return VIEWPORT_HEIGHT;
    },
  });
}

for (const dimension of ["offsetWidth", "clientWidth"]) {
  Object.defineProperty(HTMLElement.prototype, dimension, {
    configurable: true,
    get() {
      return VIEWPORT_WIDTH;
    },
  });
}

Element.prototype.getBoundingClientRect = vi.fn(function () {
  return {
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: VIEWPORT_WIDTH,
    bottom: VIEWPORT_HEIGHT,
    width: VIEWPORT_WIDTH,
    height: VIEWPORT_HEIGHT,
    toJSON: () => {},
  };
});
