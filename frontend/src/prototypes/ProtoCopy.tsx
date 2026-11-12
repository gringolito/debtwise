// PROTOTYPE, throwaway: copy that names Decidir, which "Orvalho nítido" renames to Comparar.
import { projectionMethodsEffect } from "@/lib/projectionMethods";
import { usePrototypeVariant } from "@/prototypes/variant";

export function ProjectionMethodsEffect() {
  return usePrototypeVariant() === "A"
    ? projectionMethodsEffect
    : "A projeção muda o saldo devedor futuro e o resultado das comparações.";
}
