import type { ProjectedBy, ProjectionMethodName } from "@/lib/api";
import { indexNames } from "@/lib/indexNames";

export const projectionMethodLabels: Record<ProjectionMethodName, string> = {
  trailing_12: "Média dos últimos 12 meses",
  trailing_60: "Média dos últimos 60 meses",
  focus: "Mediana do Focus (BCB)",
};

/** projectedByText names each projected index with the method that projected it. */
export function projectedByText(methods: ProjectedBy[]): string {
  return methods
    .map(({ index, method }) => `${indexNames[index]}: ${projectionMethodLabels[method]}`)
    .join("; ");
}
