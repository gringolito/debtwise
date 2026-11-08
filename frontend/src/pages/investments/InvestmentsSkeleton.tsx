import { Loading } from "@/components/patterns/Loading";
import { Skeleton } from "@/components/ui/skeleton";

export function RowsSkeleton({ rows }: { rows: number }) {
  return (
    <div className="flex flex-col rounded-lg border bg-card">
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="flex items-center gap-4 px-4 py-4">
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-28" />
          </div>
          <Skeleton className="h-5 w-24" />
        </div>
      ))}
    </div>
  );
}

/** InvestmentsSkeleton is Compras' layout in skeletons while the lots load. */
export function InvestmentsSkeleton() {
  return (
    <Loading label="Carregando investimentos">
      <Skeleton className="h-8 w-64" />
      <div className="flex flex-col gap-3 rounded-lg border bg-card p-6">
        <Skeleton className="h-4 w-44" />
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-5 w-48" />
        <RowsSkeleton rows={2} />
      </div>
    </Loading>
  );
}
