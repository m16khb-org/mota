// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AuthSessionState } from "../hooks/useAuthSession";
import { GoogleLogin } from "./GoogleLogin";

const anonymousSession: AuthSessionState = {
  authenticated: false,
  checked: true,
  user: null,
  error: null,
};

describe("GoogleLogin", () => {
  it("starts the same-origin gateway login with this page as return target", () => {
    render(<GoogleLogin session={anonymousSession} />);

    const login = screen.getByRole("link", { name: "Google로 로그인" });
    expect(login).toHaveAttribute(
      "href",
      "/api/auth/google?return_to=%2F",
    );
  });

  it("shows the verified account instead of another login action", () => {
    render(
      <GoogleLogin
        session={{
          authenticated: true,
          checked: true,
          user: { sub: "user-1", email: "mota@example.com" },
          error: null,
        }}
      />,
    );

    expect(screen.getByText("mota@example.com")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Google로 로그인" }),
    ).not.toBeInTheDocument();
  });

  it("offers logout and calls the handler when authenticated", () => {
    const onLogout = vi.fn();
    render(
      <GoogleLogin
        session={{
          authenticated: true,
          checked: true,
          user: { sub: "user-1", email: "mota@example.com" },
          error: null,
        }}
        onLogout={onLogout}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "로그아웃" }));
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it("hides logout when no handler is provided", () => {
    render(
      <GoogleLogin
        session={{
          authenticated: true,
          checked: true,
          user: { sub: "user-1", email: "mota@example.com" },
          error: null,
        }}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "로그아웃" }),
    ).not.toBeInTheDocument();
  });
});
