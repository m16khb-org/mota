/** @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppErrorBoundary } from "./AppErrorBoundary";

function Boom({ boom }: { readonly boom: boolean }) {
  if (boom) {
    throw new Error("렌더 중 예외");
  }
  return <p>정상 콘텐츠</p>;
}

describe("AppErrorBoundary", () => {
  it("keeps a recovery surface instead of a white screen when a child throws", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { rerender } = render(
      <AppErrorBoundary>
        <Boom boom={false} />
      </AppErrorBoundary>,
    );
    expect(screen.getByText("정상 콘텐츠")).toBeInTheDocument();

    rerender(
      <AppErrorBoundary>
        <Boom boom />
      </AppErrorBoundary>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "화면을 다시 불러오지 못했습니다",
    );
    expect(screen.getByText("렌더 중 예외")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeVisible();
    expect(screen.getByRole("button", { name: "새로고침" })).toBeVisible();

    // Recovery: retry clears the error and re-renders the children.
    rerender(
      <AppErrorBoundary>
        <Boom boom={false} />
      </AppErrorBoundary>,
    );
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(screen.getByText("정상 콘텐츠")).toBeInTheDocument();
    vi.mocked(console.error).mockRestore();
  });
});
