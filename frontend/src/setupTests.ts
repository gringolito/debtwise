import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Testing Library only registers its own cleanup when the test runner exposes afterEach before it
// loads, which this setup does not guarantee, so a rendered screen would leak into the next test.
afterEach(cleanup);

// jsdom lacks scrollTo, which the router calls on every navigation.
window.scrollTo = () => {};

// jsdom lacks ResizeObserver, which recharts' ResponsiveContainer needs.
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
