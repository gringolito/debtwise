import type { RegisteredMortgage, Schedule } from "@/lib/api";
import { schedule } from "./mortgageFixtures";
import { problem, stubRoutes } from "./stubServer";

interface MortgageApiOptions {
  /** The mortgage registered before the test starts; none by default. */
  mortgage?: RegisteredMortgage;
  /** Answers a PUT; a registered mortgage means success and is what the next GET returns. */
  onSave?: (body: unknown) => RegisteredMortgage | Response;
  /** The schedule the server serves once a PUT succeeds, in place of the first one. */
  scheduleAfterSave?: Schedule;
}

// Fakes the mortgage endpoints with the state the real server keeps: PUT registers, DELETE
// removes, and the schedule exists while a mortgage does.
export function stubMortgageApi({ mortgage, onSave, scheduleAfterSave }: MortgageApiOptions = {}) {
  let registered = mortgage ?? null;
  let served = schedule;
  const notFound = () => problem(404, "Not Found", "no mortgage is registered");

  return stubRoutes({
    "GET /api/health": () => Response.json({ status: "ok" }),
    "GET /api/mortgage": () => (registered ? Response.json(registered) : notFound()),
    "GET /api/mortgage/schedule": () => (registered ? Response.json(served) : notFound()),
    "PUT /api/mortgage": (req) => {
      const answer = onSave?.(req.body);
      if (!answer) throw new Error("unexpected PUT /api/mortgage");
      if (answer instanceof Response) return answer;
      registered = answer;
      served = scheduleAfterSave ?? served;
      return Response.json(answer);
    },
    "DELETE /api/mortgage": () => {
      if (!registered) return notFound();
      registered = null;
      return new Response(null, { status: 204 });
    },
  });
}
