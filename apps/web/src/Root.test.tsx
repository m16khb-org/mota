// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { Root } from "./Root";
vi.mock("./App", () => ({ App: () => <div data-testid="app">bus home</div> }));
afterEach(() => {
  cleanup();
  window.history.replaceState({}, "", "/");
});
it.each(["/3d-preview", "/3d-preview/"])("returns legacy preview %s to bus home", (path) => {
  window.history.replaceState({}, "", path);
  render(<Root />);
  expect(screen.getByTestId("app")).toBeInTheDocument();
  expect(window.location.pathname).toBe("/");
});
