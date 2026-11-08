import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BondQuote, LotImport } from "@/lib/api";
import { rowTexts, text } from "@/test/dom";
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
    ["ntn_b", "2035-05-15"],
    ["ntn_b", "2037-05-15"],
  ] as const
).map(([type, maturity]) => ({
  type,
  maturity,
  sell: { rate: "0.1", unit_price: "1000" },
  fetched_at: "2026-10-27T09:00:00Z",
}));

const header = "Título;Data da compra;Taxa;Preço unitário;Quantidade";

const rateRejection = {
  location: "body.lots[0].rate",
  message: "expected string to match pattern",
};

function stubImport(
  importResponse: (body: LotImport) => Response = (body) =>
    Response.json({ lots: body.lots.map((l, i) => ({ id: i + 1, ...l })) }, { status: 201 }),
) {
  return stubRoutes({
    "GET /api/bonds": () => Response.json({ bonds: catalogue }),
    "GET /api/lots": () => Response.json({ lots: [] }),
    "GET /api/early-sale-checks": () =>
      Response.json({ date: "2026-10-27", effect: "shorten_term", checks: [] }),
    "POST /api/lots/import": (req) => importResponse(req.body as LotImport),
  });
}

/** reject answers an import with a 422 for each rejection. */
const reject = (rejections: NonNullable<Parameters<typeof problem>[3]>) => () =>
  problem(422, "Unprocessable Entity", "validation failed", rejections);

/** pickFile gives the file input a file with contents once the catalogue has loaded. */
async function pickFile(contents: string, name = "compras.csv") {
  const input = await screen.findByLabelText("Planilha");
  await waitFor(() => expect(input).toBeEnabled());
  const file = new File([contents], name, { type: "text/csv" });
  fireEvent.change(input, { target: { files: [file] } });
}

/** chooseFile picks a file with contents and waits for its preview. */
async function chooseFile(contents: string) {
  await pickFile(contents);
  return screen.findByRole("table", { name: "Compras do arquivo" });
}

const posted = (requests: { method: string; body?: unknown }[]) =>
  requests.filter((r) => r.method === "POST").map((r) => r.body);

/**
 * previewValues reads each row of the preview the way the owner sees it: the text of a cell, the
 * option a picker shows or the value of an input. The header row is left out.
 */
function previewValues(preview: HTMLElement): string[][] {
  return within(preview)
    .getAllByRole("row")
    .slice(1)
    .map((row) =>
      Array.from(row.querySelectorAll("td")).map((cell) => {
        const control = cell.querySelector("select, input");
        if (control instanceof HTMLSelectElement) return control.selectedOptions[0]?.text ?? "";
        if (control instanceof HTMLInputElement) return control.value;
        return text(cell);
      }),
    );
}

/** previewRow is the row of the preview for the file's line. */
function previewRow(line: number): HTMLElement {
  const row = screen.getByRole("button", { name: `Remover linha ${line}` }).closest("tr");
  if (!row) throw new Error(`no preview row for line ${line}`);
  return row;
}

const bondOf = (line: number) => screen.getByLabelText(`Título da linha ${line}`);

const importHeading = () => screen.queryByRole("heading", { name: "Importar planilha" });

describe("importing purchases from a spreadsheet", () => {
  it("explains the file to pick and offers it once the titles have loaded", async () => {
    stubImport();
    renderAt("/investimentos/importar");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Importar planilha" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Revise antes de importar. Você pode corrigir qualquer linha."),
    ).toBeInTheDocument();
    expect(screen.getByText(/Tesouro IPCA\+ 2035/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Cancelar" })).toHaveAttribute(
      "href",
      "/investimentos",
    );
    expect(screen.queryByRole("button", { name: /^Importar/ })).toBeNull();
    const choose = screen.getByRole("button", { name: "Escolher arquivo" });
    await waitFor(() => expect(choose).toBeEnabled());
    const input = screen.getByLabelText("Planilha");
    expect(input).toHaveAttribute("accept", ".csv,text/csv");

    const open = vi.spyOn(input as HTMLInputElement, "click");
    fireEvent.click(choose);
    expect(open).toHaveBeenCalledOnce();
  });

  it("cannot pick a file before the titles have loaded", async () => {
    stubRoutes({ "GET /api/bonds": () => new Promise<Response>(() => {}) });
    renderAt("/investimentos/importar");

    expect(await screen.findByRole("button", { name: "Escolher arquivo" })).toBeDisabled();
    expect(screen.getByLabelText("Planilha")).toBeDisabled();
  });

  it("says the titles could not be loaded and tries again", async () => {
    let attempts = 0;
    stubRoutes({
      "GET /api/bonds": () => {
        attempts += 1;
        return attempts === 1
          ? problem(500, "Internal Server Error", "boom")
          : Response.json({ bonds: catalogue });
      },
    });
    renderAt("/investimentos/importar");

    const panel = await screen.findByRole("alert");
    expect(within(panel).getByText("Não foi possível carregar os títulos")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Escolher arquivo" })).toBeNull();

    fireEvent.click(within(panel).getByRole("button", { name: "Tentar novamente" }));

    const choose = await screen.findByRole("button", { name: "Escolher arquivo" });
    await waitFor(() => expect(choose).toBeEnabled());
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it.each([
    {
      separator: "semicolons",
      contents: [
        header,
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
        "",
        'Tesouro IPCA+ 2035,10/03/2026,"6,84%","R$ 2.256,93","0,5"',
        '"Tesouro IPCA+ com Juros Semestrais 2037",15/04/2026,"6,7","4.629,32",2',
      ].join("\r\n"),
    },
  ])(
    "previews a file separated by $separator and imports it once confirmed",
    async ({ contents }) => {
      const requests = stubImport();
      renderAt("/investimentos/importar");

      const preview = await chooseFile(contents);

      expect(screen.getByText("compras.csv")).toBeInTheDocument();
      expect(screen.getByText("· 5 linhas")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Trocar arquivo" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Escolher arquivo" })).toBeNull();
      expect(rowTexts(preview)[0]).toEqual([
        "Título",
        "Data da compra",
        "Taxa",
        "Preço unitário",
        "Quantidade",
        "Ações",
      ]);
      expect(previewValues(preview)).toEqual([
        ["Tesouro Prefixado 2029", "02/01/2026", "12,76%", "R$ 771,26", "10", ""],
        [
          "Tesouro Prefixado com Juros Semestrais 2031",
          "20/10/2026",
          "13,52",
          "912,345678",
          "1,25",
          "",
        ],
        ["Tesouro Prefixado 2029", "15/06/2026", "13,1", "780", "3", ""],
        ["Tesouro IPCA+ 2035", "10/03/2026", "6,84%", "R$ 2.256,93", "0,5", ""],
        ["Tesouro IPCA+ com Juros Semestrais 2037", "15/04/2026", "6,7", "4.629,32", "2", ""],
      ]);
      expect(screen.queryByText(/não reconhecido/)).toBeNull();
      expect(posted(requests)).toEqual([]);

      fireEvent.click(screen.getByRole("button", { name: "Importar 5 compras" }));

      await waitFor(() => expect(importHeading()).toBeNull());
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

  it("flags each row whose bond name was not recognised, with the bond suggested for it", async () => {
    stubImport();
    renderAt("/investimentos/importar");

    await chooseFile(
      [
        header,
        "tesouro ipca 2035;10/03/2026;6,84;2.256,93;0,5",
        "NTN-B Principal 2045;10/03/2026;6,9;1.100,00;1",
        "NTN-B 2035;15/04/2026;6,7;4.629,32;2",
        "Tesouro Prefixado Juros Semestrais 2031;20/10/2026;13,52;912,345678;1,25",
        "Tesouro Préfixdo 2029;02/01/2026;12,76;771,26;10",
        "Tesouro Selic 2029;02/01/2026;0,1;15.000,00;1",
        "Tesouro Prefixado 2028;02/01/2026;12,76;771,26;10",
        "Tesouro Educa+ 2035;02/01/2026;6,1;3.000,00;1",
        "NTN-B 2031;02/01/2026;6,1;3.000,00;1",
        "  tesouro prefixado 2029 ;02/01/2026;12,76;771,26;10",
        "Tesouro IPCA+ Juros Semestrais 2035;15/04/2026;6,7;4.629,32;2",
        'Tesouro IPCA+ 2035;10/03/2026;6,84;2.256,93;"0,5',
      ].join("\n"),
    );

    expect(screen.getAllByText(/não reconhecido\./)).toHaveLength(10);
    expect(bondOf(2)).toHaveDisplayValue("Tesouro IPCA+ 2035");
    expect(bondOf(3)).toHaveDisplayValue("Tesouro IPCA+ 2045");
    expect(bondOf(4)).toHaveDisplayValue("Tesouro IPCA+ com Juros Semestrais 2035");
    expect(bondOf(5)).toHaveDisplayValue("Tesouro Prefixado com Juros Semestrais 2031");
    expect(bondOf(6)).toHaveDisplayValue("Tesouro Prefixado 2029");
    for (const unmatched of [7, 8, 9, 10]) {
      expect(bondOf(unmatched)).toHaveDisplayValue("Escolha um título");
    }
    expect(bondOf(2)).toHaveAccessibleDescription(
      "“tesouro ipca 2035” não reconhecido. Confirme o título.",
    );
    expect(bondOf(7)).toHaveAccessibleDescription(
      "“Tesouro Selic 2029” não reconhecido. Escolha o título.",
    );
    expect(
      within(previewRow(7)).getByText("“Tesouro Selic 2029” não reconhecido. Escolha o título."),
    ).toBeInTheDocument();
    expect(bondOf(11)).toHaveDisplayValue("Tesouro Prefixado 2029");
    expect(bondOf(11)).not.toHaveAccessibleDescription();
    expect(within(previewRow(11)).queryByText(/não reconhecido/)).toBeNull();
    expect(bondOf(12)).toHaveDisplayValue("Tesouro IPCA+ com Juros Semestrais 2035");
    expect(within(previewRow(13)).queryByText(/não reconhecido/)).toBeNull();
    expect(
      within(bondOf(7))
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual([
      "Escolha um título",
      "Tesouro Prefixado 2029",
      "Tesouro Prefixado com Juros Semestrais 2031",
      "Tesouro IPCA+ 2035",
      "Tesouro IPCA+ 2045",
      "Tesouro IPCA+ com Juros Semestrais 2035",
      "Tesouro IPCA+ com Juros Semestrais 2037",
    ]);
  });

  it("imports the bond the owner picks over the one suggested, the row still flagged", async () => {
    const requests = stubImport();
    renderAt("/investimentos/importar");

    await chooseFile(
      [
        header,
        "tesouro ipca 2035;10/03/2026;6,84;2.256,93;0,5",
        "NTN-B Principal 2045;10/03/2026;6,9;1.100,00;1",
        "Tesouro Selic 2029;02/01/2026;0,1;15.000,00;1",
      ].join("\n"),
    );
    fireEvent.change(bondOf(3), { target: { value: "ntn_b 2037-05-15" } });
    fireEvent.change(bondOf(4), { target: { value: "ltn 2029-01-01" } });

    expect(bondOf(4)).toHaveAccessibleDescription(
      "“Tesouro Selic 2029” não reconhecido. Confirme o título.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Importar 3 compras" }));

    await waitFor(() => expect(importHeading()).toBeNull());
    expect(
      posted(requests).flatMap((body) => (body as LotImport).lots.map((l) => [l.type, l.maturity])),
    ).toEqual([
      ["ntn_b_principal", "2035-05-15"],
      ["ntn_b", "2037-05-15"],
      ["ltn", "2029-01-01"],
    ]);
  });

  it("imports the purchases as the owner edits them and leaves out the rows removed", async () => {
    const requests = stubImport();
    renderAt("/investimentos/importar");

    const preview = await chooseFile(
      [
        header,
        "Tesouro Prefixado 2029;02/01/2026;12,76%;R$ 771,26;10",
        "Tesouro IPCA+ 2035;10/03/2026;6,84;2.256,93;0,5",
        'Tesouro Prefixado 2029;02/01/2026;12,76;771,26;"10',
        "Tesouro Selic 2029;02/01/2026;0,1;15.000,00;1",
      ].join("\n"),
    );
    const edit = (label: string, value: string) =>
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    edit("Título da linha 2", "ntn_f 2031-01-01");
    edit("Data da compra da linha 2", "05/01/2026");
    edit("Taxa da linha 2", "13,1");
    edit("Preço unitário da linha 2", "800,5");
    edit("Quantidade da linha 2", "12,5");
    expect(within(previewRow(4)).queryByRole("textbox")).toBeNull();
    expect(
      within(previewRow(4)).getByText("Aspas sem par: a linha não pode ser lida."),
    ).toBeInTheDocument();
    expect(screen.getByText(/“Tesouro Selic 2029” não reconhecido/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remover linha 4" }));
    fireEvent.click(screen.getByRole("button", { name: "Remover linha 5" }));

    expect(previewValues(preview).map(([bond]) => bond)).toEqual([
      "Tesouro Prefixado com Juros Semestrais 2031",
      "Tesouro IPCA+ 2035",
    ]);
    expect(screen.queryByText(/não reconhecido/)).toBeNull();
    expect(screen.getByText("· 4 linhas")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Importar 2 compras" }));

    await waitFor(() => expect(importHeading()).toBeNull());
    expect(posted(requests)).toEqual([
      {
        lots: [
          {
            type: "ntn_f",
            maturity: "2031-01-01",
            purchase_date: "2026-01-05",
            rate: "0.131",
            unit_price: "800.5",
            quantity: "12.5",
          },
          {
            type: "ntn_b_principal",
            maturity: "2035-05-15",
            purchase_date: "2026-03-10",
            rate: "0.0684",
            unit_price: "2256.93",
            quantity: "0.5",
          },
        ],
      },
    ]);
  });

  it("groups the thousands of prices and quantities from the file and as the owner types", async () => {
    const requests = stubImport();
    renderAt("/investimentos/importar");

    await chooseFile([header, "Tesouro IPCA+ 2035;12/05/2024;6,21;2012,34;1500"].join("\n"));
    const price = screen.getByLabelText("Preço unitário da linha 2");
    expect(price).toHaveValue("2.012,34");
    expect(screen.getByLabelText("Quantidade da linha 2")).toHaveValue("1.500");

    fireEvent.change(price, { target: { value: "20123,4" } });
    expect(price).toHaveValue("20.123,4");
    fireEvent.click(screen.getByRole("button", { name: "Importar 1 compra" }));

    await waitFor(() =>
      expect(posted(requests)).toEqual([
        {
          lots: [
            {
              type: "ntn_b_principal",
              maturity: "2035-05-15",
              purchase_date: "2024-05-12",
              rate: "0.0621",
              unit_price: "20123.4",
              quantity: "1500",
            },
          ],
        },
      ]),
    );
  });

  it("offers to import a single purchase in the singular", async () => {
    stubImport();
    renderAt("/investimentos/importar");

    await chooseFile([header, "Tesouro Prefixado 2029;02/01/2026;12;771;1"].join("\n"));

    expect(screen.getByText("· 1 linha")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Importar 1 compra" })).toBeInTheDocument();
  });

  it("has nothing to import once every row is removed", async () => {
    const requests = stubImport();
    renderAt("/investimentos/importar");

    await chooseFile([header, "Tesouro Prefixado 2029;02/01/2026;12,76;771,26;10"].join("\n"));
    fireEvent.click(screen.getByRole("button", { name: "Remover linha 2" }));

    expect(screen.getByText("Nenhuma compra para importar.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Importar/ })).toBeNull();
    expect(screen.getByRole("link", { name: "Cancelar" })).toBeInTheDocument();
    expect(posted(requests)).toEqual([]);
  });

  it("has nothing to import in a file with no rows", async () => {
    stubImport();
    renderAt("/investimentos/importar");

    await pickFile(header);

    expect(await screen.findByText("Nenhuma compra para importar.")).toBeInTheDocument();
    expect(screen.getByText("· 0 linhas")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Trocar arquivo" })).toBeInTheDocument();
  });

  it("imports nothing and says why under each row the API rejects, bonds left unpicked included", async () => {
    const requests = stubImport(
      reject([
        { location: "body.lots[0].type", message: 'expected value to be one of "ltn, ntn_f"' },
        { location: "body.lots[0].maturity", message: "expected string to be RFC 3339 date" },
        { location: "body.lots[1].maturity", message: "expected string to be RFC 3339 date" },
        {
          location: "body.lots[3].purchase_date",
          message: "must not be after today",
          code: "after_today",
        },
        { location: "body.lots[4].rate", message: "expected string to match pattern" },
        { location: "body.lots[4].quantity", message: "expected string to match pattern" },
        { location: "body.lots[5].type", message: 'expected value to be one of "ltn, ntn_f"' },
        { location: "body.lots[5].rate", message: "expected string to match pattern" },
        { location: "body.lots[6].type", message: 'expected value to be one of "ltn, ntn_f"' },
      ]),
    );
    renderAt("/investimentos/importar");

    const preview = await chooseFile(
      [
        header,
        "Tesouro Selic 2029;02/01/2026;0,1;15.000,00;1",
        "Tesouro Prefixado 2099;02/01/2026;12,76;771,26;10",
        "Tesouro IPCA+ 2035;10/03/2026;6,84;2.256,93;0,5",
        "Tesouro Prefixado 2029;10/12/2026;12,76;771,26;10",
        "Tesouro Prefixado 2029;02/01/2026;127,6;771,26;10",
        'Tesouro Prefixado 2029;02/01/2026;12,76;771,26;1"0"',
        'Tesouro Prefixado 2029;02/01/2026;12,76;771,26;"10',
      ].join("\n"),
    );
    expect(previewValues(preview).slice(-2)).toEqual([
      ["Aspas sem par: a linha não pode ser lida.", ""],
      ["Aspas sem par: a linha não pode ser lida.", ""],
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Importar 7 compras" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Nenhuma compra foi importada. Corrija as linhas destacadas e importe de novo.",
    );
    const messagesOf = (line: number) =>
      within(previewRow(line))
        .queryAllByText(/\.$/)
        .map((message) => message.textContent)
        .filter((message) => !message?.includes("não reconhecido"));
    expect(messagesOf(2)).toEqual(["Título fora do catálogo."]);
    expect(messagesOf(3)).toEqual(["Título fora do catálogo."]);
    expect(messagesOf(4)).toEqual([]);
    expect(messagesOf(5)).toEqual(["Data da compra: não pode ser depois de hoje."]);
    expect(messagesOf(6)).toEqual([
      "Informe uma taxa de 0% a menos de 100% ao ano.",
      "Informe uma quantidade maior que zero, com até 2 casas decimais.",
    ]);
    expect(messagesOf(7)).toEqual(["Aspas sem par: a linha não pode ser lida."]);
    expect(messagesOf(8)).toEqual(["Aspas sem par: a linha não pode ser lida."]);
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
    expect(screen.getByRole("table", { name: "Compras do arquivo" })).toBeInTheDocument();
    expect(importHeading()).toBeInTheDocument();
  });

  it("drops the rejection of each row the owner fixes or removes, and imports what is left", async () => {
    let rejected = false;
    const requests = stubImport((body) => {
      if (!rejected) {
        rejected = true;
        return problem(422, "Unprocessable Entity", "validation failed", [
          { location: "body.lots[0].rate", message: "expected string to match pattern" },
          { location: "body.lots[1].type", message: 'expected value to be one of "ltn"' },
          { location: "body.lots[1].maturity", message: "expected string to be RFC 3339 date" },
        ]);
      }
      return Response.json(
        { lots: body.lots.map((l, i) => ({ id: i + 1, ...l })) },
        { status: 201 },
      );
    });
    renderAt("/investimentos/importar");

    await chooseFile(
      [
        header,
        "Tesouro Prefixado 2029;02/01/2026;127,6;771,26;10",
        "Tesouro Selic 2029;02/01/2026;0,1;15.000,00;1",
        "Tesouro IPCA+ 2035;10/03/2026;6,84;2.256,93;0,5",
      ].join("\n"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Importar 3 compras" }));

    const rateMessage = "Informe uma taxa de 0% a menos de 100% ao ano.";
    const bondMessage = "Título fora do catálogo.";
    expect(await within(previewRow(2)).findByText(rateMessage)).toBeInTheDocument();
    expect(within(previewRow(3)).getByText(bondMessage)).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Taxa da linha 2"), { target: { value: "12,76" } });
    expect(screen.queryByText(rateMessage)).toBeNull();
    expect(screen.getByText(bondMessage)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remover linha 3" }));
    expect(screen.queryByText(bondMessage)).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Importar 2 compras" }));

    await waitFor(() => expect(importHeading()).toBeNull());
    expect(posted(requests)[1]).toEqual({
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
          type: "ntn_b_principal",
          maturity: "2035-05-15",
          purchase_date: "2026-03-10",
          rate: "0.0684",
          unit_price: "2256.93",
          quantity: "0.5",
        },
      ],
    });
  });

  it("says nothing was imported on a rejection that names no row, keeping the rows", async () => {
    stubImport(reject([]));
    renderAt("/investimentos/importar");

    const preview = await chooseFile(
      [header, "Tesouro Prefixado 2029;02/01/2026;12,76;771,26;10"].join("\n"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Importar 1 compra" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Nenhuma compra foi importada. Corrija as linhas destacadas e importe de novo.",
    );
    expect(screen.queryByText("Não foi possível importar as compras.")).toBeNull();
    expect(previewValues(preview)).toHaveLength(1);
    expect(importHeading()).toBeInTheDocument();
  });

  it("says the purchases could not be imported when the API fails otherwise, keeping the rows", async () => {
    stubImport(() => problem(500, "Internal Server Error", "boom"));
    renderAt("/investimentos/importar");

    const preview = await chooseFile(
      [header, "Tesouro Prefixado 2029;02/01/2026;12,76;771,26;10"].join("\n"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Importar 1 compra" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível importar as compras.",
    );
    expect(screen.queryByText(/Nenhuma compra foi importada/)).toBeNull();
    expect(previewValues(preview)).toHaveLength(1);
    expect(importHeading()).toBeInTheDocument();
  });

  it("replaces the preview and the rejections when another file is picked", async () => {
    const requests = stubImport(reject([rateRejection]));
    renderAt("/investimentos/importar");

    await chooseFile([header, "Tesouro Prefixado 2029;02/01/2026;127,6;771,26;10"].join("\n"));
    const replace = vi.spyOn(screen.getByLabelText("Planilha") as HTMLInputElement, "click");
    fireEvent.click(screen.getByRole("button", { name: "Trocar arquivo" }));
    expect(replace).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Importar 1 compra" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();

    await pickFile(
      [
        header,
        "Tesouro Prefixado 2029;02/01/2026;12,76;771,26;10",
        "Tesouro IPCA+ 2035;10/03/2026;6,84;2.256,93;0,5",
      ].join("\n"),
      "corrigido.csv",
    );

    expect(await screen.findByRole("button", { name: "Importar 2 compras" })).toBeInTheDocument();
    expect(screen.getByText("corrigido.csv")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText(/taxa de 0%/)).toBeNull();
    expect(posted(requests)).toHaveLength(1);
  });
});
