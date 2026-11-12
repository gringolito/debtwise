import type { ProjectedBy, ProjectionMethodName } from "@/lib/api";
import { indexNames } from "@/lib/indexNames";

export const projectionMethodLabels: Record<ProjectionMethodName, string> = {
  trailing_12: "Média dos últimos 12 meses",
  trailing_60: "Média dos últimos 60 meses",
  focus: "Mediana do Focus (BCB)",
};

/** What choosing a projection method changes, said under every place that shows the choice. */
export const projectionMethodsEffect =
  "A projeção muda o saldo devedor futuro e o resultado das comparações.";

/** projectedByText names each projected index with the method that projected it. */
export function projectedByText(methods: ProjectedBy[]): string {
  return methods
    .map(({ index, method }) => `${indexNames[index]}: ${projectionMethodLabels[method]}`)
    .join("; ");
}
