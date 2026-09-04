// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Root } from "./Root";

vi.mock("./App", () => ({ App: () => <div data-testid="app">app</div> }));
vi.mock("./components/map-preview/MapPreviewPage", () => ({
	MapPreviewPage: () => <div data-testid="preview">preview-ready</div>,
}));

describe("Root pathname routing", () => {
	afterEach(() => {
		cleanup();
		window.history.replaceState({}, "", "/");
	});

	it.each(["/", "/3d-preview/", "/api/foo", "/some-unknown-path"]) (
		"renders App without preview UI for non-preview pathname %s",
		(pathname) => {
			window.history.replaceState({}, "", pathname);
			render(<Root />);

			expect(screen.getByTestId("app")).toBeInTheDocument();
			expect(screen.queryByTestId("preview")).not.toBeInTheDocument();
			expect(screen.queryByRole("status")).not.toBeInTheDocument();
		},
	);

	it("renders the lazy preview only for the exact /3d-preview pathname", async () => {
		window.history.replaceState({}, "", "/3d-preview");
		render(<Root />);

		expect(screen.getByRole("status")).toHaveTextContent(
			"3D 지도 미리보기를 불러오는 중이에요.",
		);
		expect(screen.getByRole("link", { name: "모타로 돌아가기" })).toHaveAttribute(
			"href",
			"/",
		);
		expect(await screen.findByTestId("preview")).toHaveTextContent("preview-ready");
		expect(screen.queryByTestId("app")).not.toBeInTheDocument();

		window.history.replaceState({}, "", "/3d-preview/extra");
		cleanup();
		render(<Root />);
		expect(screen.getByTestId("app")).toBeInTheDocument();
	});
});
