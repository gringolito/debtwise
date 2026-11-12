// PROTOTYPE, throwaway: the onboarding's field errors for variant B/C. Two sources, one reader:
// what the browser checked before a step went on, and what the API rejected. Either clears the
// moment its field changes, and a failed step moves focus to its first invalid field.
import { useEffect, useState } from "react";
import { type FormValues, rejections } from "@/lib/mortgageForm";
import { changedLocations, checkStep, type StepErrors } from "@/prototypes/ProtoOnboardingChecks";

const none: StepErrors = new Map();
const noneDismissed: ReadonlySet<string> = new Set();

function focusFirstInvalid() {
  const first = document.querySelector<HTMLElement>('main [aria-invalid="true"]');
  const target = first?.matches('[role="radiogroup"]')
    ? first.querySelector<HTMLElement>('[role="radio"]')
    : first;
  target?.focus();
}

export function useOnboardingErrors(serverError: Error | null, proto: boolean) {
  const [local, setLocal] = useState<StepErrors>(none);
  const [dismissal, setDismissal] = useState<{
    error: Error | null;
    locations: ReadonlySet<string>;
  }>({ error: null, locations: noneDismissed });
  const [focusTick, setFocusTick] = useState(0);

  const rejected = rejections(serverError);
  // A new rejection starts with nothing dismissed.
  const dismissed = dismissal.error === serverError ? dismissal.locations : noneDismissed;

  useEffect(() => {
    if (focusTick > 0) focusFirstInvalid();
  }, [focusTick]);

  // InsuranceStep asks by the form's names ("mipRates[0].rate"); the API and the checks use "mip_rates[0].rate".
  const snake = (location: string) => location.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

  const messageOf = (...locations: string[]) => {
    for (const location of proto ? locations.flatMap((l) => [l, snake(l)]) : locations) {
      const message =
        local.get(location) ?? (dismissed.has(location) ? undefined : rejected.get(location));
      if (message !== undefined) return message;
    }
    return undefined;
  };

  return {
    messageOf,
    /** Whether a rejection the owner has not yet answered is still showing. */
    hasRejections: [...rejected.keys()].some((location) => !dismissed.has(location)),
    /** Checks the step; when it fails, shows why and focuses the first invalid field. */
    check(step: number, values: FormValues): boolean {
      const errors = checkStep(step, values);
      setLocal(errors);
      if (errors.size > 0) setFocusTick((tick) => tick + 1);
      return errors.size === 0;
    },
    /** Answers a change of the values: whatever it made out of date stops showing. */
    changed(before: FormValues, after: FormValues) {
      const stale = changedLocations(before, after);
      setLocal((current) => {
        const kept = [...current].filter(([location]) => !stale(location));
        return kept.length === current.size ? current : new Map(kept);
      });
      const fresh = [...rejected.keys()].filter(stale);
      if (fresh.length > 0) {
        setDismissal({ error: serverError, locations: new Set([...dismissed, ...fresh]) });
      }
    },
    /** Forgets the browser's checks, as when the owner moves to another step. */
    reset() {
      setLocal(none);
    },
    /** Moves focus to the first invalid field once the step has rendered. */
    focus() {
      setFocusTick((tick) => tick + 1);
    },
  };
}
