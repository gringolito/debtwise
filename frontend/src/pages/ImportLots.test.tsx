import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BondQuote, LotImport } from "@/lib/api";
import { rowTexts } from "@/test/dom";
import { renderAt } from "@/test/renderAt";
import { problem, stubRoutes } from "@/test/stubServer";

afterEach(() => {
  vi.unstubAllGlobals();
});

const catalogue: BondQuote[] = (
  [
    ["ltn", "2029-01-01"],
    ["ntn_f", "2031-01-01"],
    ["ntn_b_principal", "2035-05-15"],
    ["ntn_b_principal", "2045-05-15"],
    ["ntn_b", "2037-05-15"],
  ] as const
).map(([type, maturity]) => ({
  type,
  maturity,
  sell: { rate: "0.1", unit_price: "1000" },
  fetched_at: "2026-10-27T09:00:00Z",
}));

function stubImport(rejections: { location: string; message: string }[] = []) {
  return stubRoutes({
    "GET /api/bonds": () => Response.json({ bonds: catalogue }),
    "POST /api/lots/import": (req) => {
      if (rejections.length > 0) {
        return problem(422, "Unprocessable Entity", "validation failed", rejections);
      }
      const body = req.body as LotImport;
      return Response.json(
        { lots: body.lots.map((l, i) => ({ id: i + 1, ...l })) },
        { status: 201 },
      );
    },
  });
}

/** chooseFile picks a file with contents and waits for its preview. */
async function chooseFile(contents: string) {
  const input = await screen.findByLabelText("Arquivo CSV");
  await waitFor(() => expect(input).toBeEnabled());
  const file = new File([contents], "lotes.csv", { type: "text/csv" });
  fireEvent.change(input, { target: { files: [file] } });
  return screen.findByRole("table", { name: "Lotes do arquivo" });
}

const posted = (requests: { method: string; body?: unknown }[]) =>
  requests.filter((r) => r.method === "POST").map((r) => r.body);

describe("importing lots from a CSV file", () => {
  it.each([
    {
      separator: "semicolons",
      contents: [
        "Título;Data da compra;Taxa;Preço unitário;Quantidade",
        "Tesouro Prefixado 2029;02/01/2026;12,76%;R$ 771,26;10",
        "Tesouro Prefixado com Juros Semestrais 2031;20/10/2026;13,52;912,345678;1,25",
        "Tesouro Prefixado 2029;15/06/2026;13,1;780;3",
        "",
        "Tesouro IPCA+ 2035;10/03/2026;6,84%;R$ 2.256,93;0,5",
        "Tesouro IPCA+ com Juros Semestrais 2037;15/04/2026;6,7;4.629,32;2",
      ].join("\n"),
    },
    {
      separator: "commas",
      contents: [
        "Título,Data da compra,Taxa,Preço unitário,Quantidade",
        'Tesouro Prefixado 2029,02/01/2026,"12,76%","R$ 771,26",10',
        'Tesouro Prefixado com Juros Semestrais 2031,20/10/2026,"13,52","912,345678","1,25"',
        'Tesouro Prefixado 2029,15/06/2026,"13,1",780,3',
        'Tesouro IPCA+ 2035,10/03/2026,"6,84%","R$ 2.256,93","0,5"',
        '"Tesouro IPCA+ com Juros Semestrais 2037",15/04/2026,"6,7","4.629,32",2',
      ].join("\r\n"),
    },
  ])(
    "previews a file separated by $separator and imports it once confirmed",
    async ({ contents }) => {
      const requests = stubImport();
      renderAt("/lotes/importar");

      const preview = await chooseFile(contents);

      expect(rowTexts(preview).map((row) => row.slice(0, 4))).toEqual([
        ["Linha", "No arquivo", "Título", "Data da compra"],
        ["2", "Tesouro Prefixado 2029", "Tesouro Prefixado 2029", "02/01/2026"],
        [
          "3",
          "Tesouro Prefixado com Juros Semestrais 2031",
          "Tesouro Prefixado com Juros Semestrais 2031",
          "20/10/2026",
        ],
        ["4", "Tesouro Prefixado 2029", "Tesouro Prefixado 2029", "15/06/2026"],
        expect.arrayContaining(["Tesouro IPCA+ 2035", "10/03/2026"]),
        expect.arrayContaining(["Tesouro IPCA+ com Juros Semestrais 2037", "15/04/2026"]),
      ]);
      expect(posted(requests)).toEqual([]);

      fireEvent.click(screen.getByRole("button", { name: "Importar 5 lotes" }));

      const status = await screen.findByRole("status");
      expect(status).toHaveTextContent("5 lotes importados. Ver lotes.");
      expect(within(status).getByRole("link", { name: "Ver lotes" })).toHaveAttribute(
        "href",
        "/lotes",
      );
      expect(screen.queryByRole("table", { name: "Lotes do arquivo" })).toBeNull();
      expect(posted(requests)).toEqual([
        {
          lots: [
            {
              type: "ltn",
              maturity: "2029-01-01",
              purchase_date: "2026-01-02",
              rate: "0.1276",
              unit_price: "771.26",
              quantity: "10",
            },
            {
              type: "ntn_f",
              maturity: "2031-01-01",
              purchase_date: "2026-10-20",
              rate: "0.1352",
              unit_price: "912.345678",
              quantity: "1.25",
            },
            {
              type: "ltn",
              maturity: "2029-01-01",
              purchase_date: "2026-06-15",
              rate: "0.131",
              unit_price: "780",
              quantity: "3",
            },
            {
              type: "ntn_b_principal",
              maturity: "2035-05-15",
              purchase_date: "2026-03-10",
              rate: "0.0684",
              unit_price: "2256.93",
              quantity: "0.5",
            },
            {
              type: "ntn_b",
              maturity: "2037-05-15",
              purchase_date: "2026-04-15",
              rate: "0.067",
              unit_price: "4629.32",
              quantity: "2",
            },
          ],
        },
      ]);
    },
  );

  it("suggests the closest bond for a name the catalogue lacks and imports the one the owner picks", async () => {
    const requests = stubImport();
    renderAt("/lotes/importar");

    await chooseFile(
      [
        "Título;Data da compra;Taxa;Preço unitário;Quantidade",
        "tesouro ipca 2035;10/03/2026;6,84;2.256,93;0,5",
        "NTN-B Principal 2045;10/03/2026;6,9;1.100,00;1",
        "Tesouro Prefixado Juros Semestrais 2031;20/10/2026;13,52;912,345678;1,25",
        "Tesouro Selic 2029;02/01/2026;0,1;15.000,00;1",
        "Tesouro Prefixado 2028;02/01/2026;12,76;771,26;10",
        "Tesouro Educa+ 2035;02/01/2026;6,1;3.000,00;1",
      ].join("\n"),
    );

    const bondOf = (line: number) => screen.getByLabelText(`Título da linha ${line}`);
    expect(bondOf(2)).toHaveDisplayValue("Tesouro IPCA+ 2035");
    expect(bondOf(3)).toHaveDisplayValue("Tesouro IPCA+ 2045");
    expect(bondOf(4)).toHaveDisplayValue("Tesouro Prefixado com Juros Semestrais 2031");
    expect(bondOf(5)).toHaveDisplayValue("Escolha um título");
    expect(bondOf(6)).toHaveDisplayValue("Escolha um título");
    expect(bondOf(7)).toHaveDisplayValue("Escolha um título");
    expect(
      within(bondOf(5))
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual([
      "Escolha um título",
      "Tesouro Prefixado 2029",
      "Tesouro Prefixado com Juros Semestrais 2031",
      "Tesouro IPCA+ 2035",
      "Tesouro IPCA+ 2045",
      "Tesouro IPCA+ com Juros Semestrais 2037",
    ]);

    fireEvent.change(bondOf(3), { target: { value: "ntn_b_principal 2035-05-15" } });
    fireEvent.change(bondOf(5), { target: { value: "ltn 2029-01-01" } });
    fireEvent.change(bondOf(6), { target: { value: "ltn 2029-01-01" } });
    fireEvent.change(bondOf(7), { target: { value: "ntn_b_principal 2035-05-15" } });
    fireEvent.click(screen.getByRole("button", { name: "Importar 6 lotes" }));

    expect(await screen.findByRole("status")).toHaveTextContent("6 lotes importados.");
    expect(
      posted(requests).flatMap((body) => (body as LotImport).lots.map((l) => [l.type, l.maturity])),
    ).toEqual([
      ["ntn_b_principal", "2035-05-15"],
      ["ntn_b_principal", "2035-05-15"],
      ["ntn_f", "2031-01-01"],
      ["ltn", "2029-01-01"],
      ["ltn", "2029-01-01"],
      ["ntn_b_principal", "2035-05-15"],
    ]);
  });

  it("reports every invalid row, bonds left unpicked included, and imports nothing", async () => {
    const requests = stubImport([
      { location: "body.lots[0].type", message: 'expected value to be one of "ltn, ntn_f"' },
      { location: "body.lots[0].maturity", message: "expected string to be RFC 3339 date" },
      { location: "body.lots[1].maturity", message: "expected string to be RFC 3339 date" },
      { location: "body.lots[3].purchase_date", message: "must not be after today" },
      { location: "body.lots[4].rate", message: "expected string to match pattern" },
      { location: "body.lots[5].type", message: 'expected value to be one of "ltn, ntn_f"' },
      { location: "body.lots[5].rate", message: "expected string to match pattern" },
      { location: "body.lots[6].type", message: 'expected value to be one of "ltn, ntn_f"' },
    ]);
    renderAt("/lotes/importar");

    await chooseFile(
      [
        "Título;Data da compra;Taxa;Preço unitário;Quantidade",
        "Tesouro Selic 2029;02/01/2026;0,1;15.000,00;1",
        "Tesouro Prefixado 2099;02/01/2026;12,76;771,26;10",
        "Tesouro IPCA+ 2035;10/03/2026;6,84;2.256,93;0,5",
        "Tesouro Prefixado 2029;10/12/2026;12,76;771,26;10",
        "Tesouro Prefixado 2029;02/01/2026;127,6;771,26;10",
        'Tesouro Prefixado 2029;02/01/2026;12,76;771,26;1"0"',
        'Tesouro Prefixado 2029;02/01/2026;12,76;771,26;"10',
      ].join("\n"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Importar 7 lotes" }));

    const invalidRows = await screen.findByRole("list", { name: "Linhas inválidas" });
    expect(
      within(invalidRows)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual([
      "Linha 2: Título fora do catálogo.",
      "Linha 3: Título fora do catálogo.",
      "Linha 5: Informe a data da compra (dd/mm/aaaa), que não pode ser futura.",
      "Linha 6: Informe uma taxa de 0% a menos de 100% ao ano.",
      "Linha 7: Aspas sem par: a linha não pode ser lida.",
      "Linha 8: Aspas sem par: a linha não pode ser lida.",
    ]);
    expect(posted(requests)).toMatchObject([
      {
        lots: [
          { type: "Tesouro Selic 2029", maturity: "" },
          { type: "Tesouro Prefixado 2099", maturity: "" },
          { type: "ntn_b_principal", maturity: "2035-05-15" },
          { type: "ltn", maturity: "2029-01-01", purchase_date: "2026-12-10" },
          { type: "ltn", maturity: "2029-01-01", rate: "1.276" },
          { type: "", quantity: "" },
          { type: "", quantity: "" },
        ],
      },
    ]);
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByRole("table", { name: "Lotes do arquivo" })).toBeInTheDocument();
  });
});
