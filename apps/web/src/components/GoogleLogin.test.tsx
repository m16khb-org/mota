// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { AuthSessionState } from "../hooks/useAuthSession";
import { GoogleLogin } from "./GoogleLogin";

const anonymousSession: AuthSessionState = {
  authenticated: false,
  checked: true,
  user: null,
  error: null,
};

describe("GoogleLogin", () => {
  it("starts the local PKCE login with this page as return target", () => {
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
});
