import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DateInput } from "./DateInput";
import { InputRow } from "./FieldRows";
import { GroupedList } from "./GroupedList";

/** A form that holds the date, as the pages do, with buttons for what changes it from outside. */
function Form({ initial, onChange }: { initial: string; onChange: (iso: string) => void }) {
  const [value, setValue] = useState(initial);
  const change = (iso: string) => {
    setValue(iso);
    onChange(iso);
  };
  return (
    <>
      <DateInput aria-label="Data" value={value} onChange={change} />
      <button type="button" onClick={() => setValue("2024-05-20")}>
        Trocar
      </button>
      <button type="button" onClick={() => setValue("")}>
        Limpar
      </button>
    </>
  );
}

function renderForm(initial = "") {
  const onChange = vi.fn();
  render(<Form initial={initial} onChange={onChange} />);
  return { onChange, input: screen.getByLabelText<HTMLInputElement>("Data") };
}

function Row({ message, onChange }: { message?: string; onChange: (iso: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <GroupedList>
      <InputRow
        label="Data"
        type="date"
        value={value}
        message={message}
        onChange={(iso) => {
          setValue(iso);
          onChange(iso);
        }}
      />
    </GroupedList>
  );
}

/** A row for a date, with the message the page gives it. */
function renderRow(message?: string) {
  const onChange = vi.fn();
  render(<Row message={message} onChange={onChange} />);
  return { onChange, input: screen.getByLabelText<HTMLInputElement>("Data") };
}

function type(input: HTMLInputElement, value: string) {
  fireEvent.change(input, { target: { value } });
}

describe("typing a date", () => {
  it("starts empty with the format as its placeholder", () => {
    const { input } = renderForm();

    expect(input).toHaveValue("");
    expect(input).toHaveAttribute("placeholder", "dd/mm/aaaa");
    expect(input).toHaveAttribute("inputmode", "numeric");
  });

  it.each([
    ["a day", "15", "15"],
    ["a day and a month", "1503", "15/03"],
    ["a whole date", "15032023", "15/03/2023"],
    ["slashes the owner typed", "15/03/2023", "15/03/2023"],
    ["letters among the digits", "15a03", "15/03"],
    ["more digits than a date has", "150320231", "15/03/2023"],
  ])("writes %s as dd/mm/aaaa", (_, typed, shown) => {
    const { input } = renderForm();

    type(input, typed);

    expect(input).toHaveValue(shown);
  });

  it("gives the ISO date once the text is a whole date, and nothing before", () => {
    const { input, onChange } = renderForm();

    for (const typed of ["1", "15", "150", "15/03", "15/032", "15/03/2023"]) {
      type(input, typed);
    }

    expect(onChange.mock.calls).toEqual([[""], [""], [""], [""], [""], ["2023-03-15"]]);
  });

  it.each([
    ["with slashes", "15/03/2023"],
    ["without them", "15032023"],
  ])("takes a date pasted %s", (_, pasted) => {
    const { input, onChange } = renderForm();

    type(input, pasted);

    expect(input).toHaveValue("15/03/2023");
    expect(onChange.mock.calls).toEqual([["2023-03-15"]]);
  });

  it("keeps what is left when a digit is deleted", () => {
    const { input, onChange } = renderForm("2023-03-15");

    type(input, "15/03/202");

    expect(input).toHaveValue("15/03/202");
    expect(onChange.mock.calls).toEqual([[""]]);
  });

  it("keeps the caret after the digit typed in the middle of the text", () => {
    const { input } = renderForm();
    type(input, "1503");

    fireEvent.change(input, { target: { value: "15/073", selectionStart: 5, selectionEnd: 5 } });

    expect(input).toHaveValue("15/07/3");
    expect(input.selectionStart).toBe(5);
  });

  it("keeps the text when a slash is deleted, with the caret before it", () => {
    const { input } = renderForm();
    type(input, "1503");

    fireEvent.change(input, { target: { value: "1503", selectionStart: 2, selectionEnd: 2 } });

    expect(input).toHaveValue("15/03");
    expect(input.selectionStart).toBe(2);
  });
});

describe("a date that does not exist", () => {
  it.each(["31/02/2026", "00/13/2025", "29/02/2025", "15/03/0000"])(
    "gives nothing for %s and says so on the row, over the page's message",
    (typed) => {
      const { input, onChange } = renderRow("Obrigatória.");

      type(input, typed);

      expect(onChange.mock.calls).toEqual([[""]]);
      expect(input).toBeInvalid();
      expect(input).toHaveAccessibleDescription("Essa data não existe.");
      expect(screen.queryByText("Obrigatória.")).toBeNull();
    },
  );

  it("is a date on a leap day", () => {
    const { input, onChange } = renderRow();

    type(input, "29/02/2024");

    expect(onChange.mock.calls).toEqual([["2024-02-29"]]);
    expect(input).toBeValid();
  });

  it("gives the page's message back once the text is no longer that date", () => {
    const { input } = renderRow("Obrigatória.");

    type(input, "31/02/2026");
    type(input, "31/02/202");
    expect(input).toHaveAccessibleDescription("Obrigatória.");

    type(input, "31/02/2026");
    type(input, "28/02/2026");
    expect(input).toHaveAccessibleDescription("Obrigatória.");
    expect(screen.queryByText("Essa data não existe.")).toBeNull();
  });

  it("says nothing once the text is cleared", () => {
    const { input } = renderRow();
    type(input, "31/02/2026");

    type(input, "");

    expect(input).not.toHaveAccessibleDescription();
    expect(input).toBeValid();
  });
});

describe("a date set from outside", () => {
  it("shows the value it starts with as dd/mm/aaaa", () => {
    const { input } = renderForm("2023-03-15");

    expect(input).toHaveValue("15/03/2023");
  });

  it("rewrites the text when the value changes, and empties it when the value empties", () => {
    const { input } = renderForm("2023-03-15");

    fireEvent.click(screen.getByRole("button", { name: "Trocar" }));
    expect(input).toHaveValue("20/05/2024");

    fireEvent.click(screen.getByRole("button", { name: "Limpar" }));
    expect(input).toHaveValue("");
  });
});

describe("the calendar", () => {
  const opened: string[] = [];

  afterEach(() => {
    opened.length = 0;
    Reflect.deleteProperty(HTMLInputElement.prototype, "showPicker");
  });

  function stubPicker() {
    Object.defineProperty(HTMLInputElement.prototype, "showPicker", {
      configurable: true,
      value(this: HTMLInputElement) {
        opened.push(`${this.type} ${this.value}`);
      },
    });
  }

  it("opens the native picker on the date typed", () => {
    stubPicker();
    renderForm("2023-03-15");

    fireEvent.click(screen.getByRole("button", { name: "Abrir calendário" }));

    expect(opened).toEqual(["date 2023-03-15"]);
  });

  it("writes the date picked in it, and gives it as ISO", () => {
    const { input, onChange } = renderForm();
    const picker = document.querySelector<HTMLInputElement>('input[type="date"]');
    if (!picker) throw new Error("the picker is not rendered");

    fireEvent.change(picker, { target: { value: "2024-05-20" } });

    expect(input).toHaveValue("20/05/2024");
    expect(onChange.mock.calls).toEqual([["2024-05-20"]]);
  });

  it("keeps its picker out of the tab order and away from screen readers", () => {
    renderForm();
    const picker = document.querySelector('input[type="date"]');

    expect(picker).toHaveAttribute("tabindex", "-1");
    expect(picker).toHaveAttribute("aria-hidden", "true");
    expect(screen.getAllByRole("textbox")).toHaveLength(1);
  });
});
