import "@testing-library/jest-dom/vitest";

// jsdom lacks scrollTo, which the router calls on every navigation.
window.scrollTo = () => {};
