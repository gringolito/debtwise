import { Loading } from "@/components/patterns/Loading";
import { Skeleton } from "@/components/ui/skeleton";

const groups = [5, 2, 2];

/** ContractSkeleton is the Contrato page's grouped lists in skeletons while the mortgage loads. */
export function ContractSkeleton() {
  return (
    <Loading label="Carregando contrato">
      {groups.map((rows, group) => (
        <div key={group} className="flex flex-col gap-2">
          <Skeleton className="mx-4 h-3 w-24" />
          <div className="flex flex-col rounded-lg border bg-card">
            {Array.from({ length: rows }, (_, row) => (
              <div key={row} className="flex min-h-13 items-center justify-between gap-4 px-4">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-28" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </Loading>
  );
}
