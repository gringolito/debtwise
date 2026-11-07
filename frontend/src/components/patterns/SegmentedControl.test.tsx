import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SegmentedControl, SegmentedControlItem } from "./SegmentedControl";

function renderControl(onValueChange: (value: string) => void) {
  render(
    <SegmentedControl aria-label="Gráfico" value="saldo" onValueChange={onValueChange}>
      <SegmentedControlItem value="saldo">Saldo</SegmentedControlItem>
      <SegmentedControlItem value="prestacao">Prestação</SegmentedControlItem>
    </SegmentedControl>,
  );
}

describe("segmented control", () => {
  it("reports the segment chosen", () => {
    const onValueChange = vi.fn();
    renderControl(onValueChange);

    fireEvent.click(screen.getByRole("radio", { name: "Prestação" }));

    expect(onValueChange.mock.calls).toEqual([["prestacao"]]);
  });

  it("keeps the selected segment when it is chosen again", () => {
    const onValueChange = vi.fn();
    renderControl(onValueChange);

    fireEvent.click(screen.getByRole("radio", { name: "Saldo" }));

    expect(onValueChange).not.toHaveBeenCalled();
    expect(screen.getByRole("radio", { name: "Saldo" })).toHaveAttribute("aria-checked", "true");
  });
});
