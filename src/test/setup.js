import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Vitest runs without `globals: true`, so React Testing Library's automatic
// cleanup never registers itself. Without this, each test's DOM leaks into the
// next one and queries start matching elements from a previous render.
afterEach(cleanup);
