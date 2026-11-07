import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorPanel } from "./ErrorPanel";
import { Loading } from "./Loading";

function MortgageBalance({ load }: { load: () => Promise<string> }) {
  const query = useQuery({ queryKey: ["balance"], queryFn: load });
  if (query.isPending) {
    return (
      <Loading label="Carregando financiamento">
        <Skeleton className="h-10 w-60" />
      </Loading>
    );
  }
  if (query.isError) {
    return (
      <ErrorPanel
        title="Não foi possível carregar seu financiamento"
        onRetry={() => query.refetch()}
      />
    );
  }
  return <p>{query.data}</p>;
}

describe("error panel", () => {
  it("refetches the failed query and shows what it loads", async () => {
    let answer: (balance: string) => void = () => {};
    const load = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockReturnValueOnce(
        new Promise((resolve) => {
          answer = resolve;
        }),
      );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MortgageBalance load={load} />
      </QueryClientProvider>,
    );

    const panel = await screen.findByRole("alert");
    expect(panel).toHaveTextContent(
      "Não foi possível carregar seu financiamentoVerifique sua conexão. Seus dados estão salvos.Tentar novamente",
    );
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));

    expect(await screen.findByRole("status", { name: "Carregando financiamento" })).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    answer("R$ 431.876,22");
    expect(await screen.findByText("R$ 431.876,22")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(load).toHaveBeenCalledTimes(2);
  });
});
