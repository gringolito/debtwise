import { Loading } from "@/components/patterns/Loading";
import { Skeleton } from "@/components/ui/skeleton";

function PanelSkeleton() {
  return (
    <div className="flex flex-col gap-2 rounded-lg glass p-6">
      <Skeleton className="h-4 w-28" />
      <Skeleton className="mt-2 h-10 w-48" />
      <Skeleton className="h-4 w-40" />
      <Skeleton className="mt-4 h-1.5 w-full" />
      <Skeleton className="mt-6 h-5 w-44" />
    </div>
  );
}

/** DashboardSkeleton is Início's layout in skeletons while what it shows loads. */
export function DashboardSkeleton() {
  return (
    <Loading label="Carregando início" className="gap-10">
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3 rounded-lg bg-foreground/5 p-6 sm:p-8">
          <Skeleton className="h-4 w-48 max-w-full" />
          <Skeleton className="h-7 w-2/3" />
          <Skeleton className="h-5 w-1/2" />
          <div className="mt-4 flex flex-wrap gap-2">
            <Skeleton className="h-11 w-36" />
            <Skeleton className="h-11 w-28" />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <PanelSkeleton />
          <PanelSkeleton />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-32" />
        <div className="flex flex-col rounded-lg glass">
          {[0, 1].map((row) => (
            <div key={row} className="flex items-center gap-4 px-4 py-3">
              <Skeleton className="size-8" />
              <div className="flex flex-1 flex-col gap-1">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-56" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </Loading>
  );
}
