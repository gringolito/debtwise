import { useMutation } from "@tanstack/react-query";
import { decide } from "@/lib/api";

/** useDecide compares an amount; nothing is stored, so there is no cache to settle after it. */
export function useDecide() {
  return useMutation({ mutationFn: decide });
}
