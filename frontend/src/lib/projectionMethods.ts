import type { ProjectionMethodName } from "@/lib/api";

export const projectionMethodLabels: Record<ProjectionMethodName, string> = {
  trailing_12: "Média dos últimos 12 meses",
  trailing_60: "Média dos últimos 60 meses",
  focus: "Mediana do Focus (BCB)",
};
