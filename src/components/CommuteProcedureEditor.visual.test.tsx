/** @vitest-environment jsdom */

import { readFileSync } from "node:fs";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CommuteProcedureEditor } from "./CommuteProcedureEditor";
import { companyPlace } from "./CommuteProcedureEditor.test-fixtures";

const styles = readFileSync("src/styles.css", "utf8");
const taskSevenStyles = styles.split("/* Task 7 - ordered commute procedure editor */")[1] ?? "";

describe("CommuteProcedureEditor visual accessibility", () => {
  it("uses a scoped 3px focus ring with a 2px offset for editor text inputs and selects", () => {
    expect(taskSevenStyles).toMatch(/\.procedure-name-field input:focus-visible,[\s\S]*?\.procedure-field select:focus-visible \{[\s\S]*?outline: 3px solid var\(--route-blue\);[\s\S]*?outline-offset: 2px;/);
  });

  it("decorates inline and top-level validation guidance with hidden alert icons", () => {
    render(
      <CommuteProcedureEditor
        direction="company"
        place={companyPlace}
        procedure={null}
        onCancel={vi.fn()}
        onSave={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "버스 추가" }));

    const messages = document.querySelectorAll(".procedure-field-error, .procedure-save-status");
    expect(messages.length).toBeGreaterThan(0);
    for (const message of messages) {
      expect(message.querySelector("svg[aria-hidden='true']")).not.toBeNull();
    }
  });
});
