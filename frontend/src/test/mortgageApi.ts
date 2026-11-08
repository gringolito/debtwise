import type {
  PrepaymentInput,
  PrepaymentOutcome,
  PrepaymentPreview,
  PrepaymentPreviewInput,
  RegisteredMortgage,
  Rule,
  Schedule,
  StatementDrift,
  StatementInput,
  StatementPreview,
  StatementPreviewInput,
} from "@/lib/api";
import { schedule } from "./mortgageFixtures";
import { problem, stubRoutes } from "./stubServer";

interface MortgageApiOptions {
  /** The mortgage registered before the test starts; none by default. */
  mortgage?: RegisteredMortgage;
  /** The schedule served before any save; the six-installment `schedule` fixture by default. */
  schedule?: Schedule;
  /** Answers a PUT; a registered mortgage means success and is what the next GET returns. */
  onSave?: (body: unknown) => RegisteredMortgage | Response;
  /** The schedule the server serves once a PUT succeeds, in place of the first one. */
  scheduleAfterSave?: Schedule;
  /** Answers a schedule preview; the schedule served before any save by default. */
  onPreview?: (body: unknown) => Schedule | Response;
  /** The prepayments recorded before the test starts, in date order; none by default. */
  prepayments?: PrepaymentOutcome[];
  /** The statements recorded before the test starts, in date order; none by default. */
  statements?: StatementDrift[];
  /**
   * The schedule the server serves once a prepayment or a statement is recorded, edited or
   * deleted, in place of the one before.
   */
  scheduleAfterChange?: Schedule;
  /** What a prepayment preview answers once the body passes validation. */
  prepaymentPreview?: (input: PrepaymentPreviewInput) => PrepaymentPreview;
  /** What a statement preview answers once the body passes validation. */
  statementPreview?: (input: StatementPreviewInput) => StatementPreview;
}

interface FieldError {
  location: string;
  message: string;
  code?: Rule;
}

const byDate = (a: { date: string }, b: { date: string }) => a.date.localeCompare(b.date);

const cents = (amount: string) => Math.round(Number(amount) * 100);

// Fakes the mortgage endpoints with the state the real server keeps: PUT registers, DELETE
// removes, and the schedule exists while a mortgage does. Prepayments and statements are kept in
// date order, get the next ID when recorded, and are validated the way the server does: a prepayment
// is for more than zero, neither is dated before the contract, and a date holds one statement. A
// recorded prepayment changed nothing, and a recorded statement has computed no balance, so its
// drift is the whole balance it reports. Previews are validated the same way.
export function stubMortgageApi({
  mortgage,
  schedule: initialSchedule = schedule,
  onSave,
  scheduleAfterSave,
  onPreview,
  prepayments = [],
  statements = [],
  scheduleAfterChange,
  prepaymentPreview = () => ({
    current_payoff_date: initialSchedule.installments.at(-1)?.due_date ?? "",
    payoff_date: initialSchedule.installments.at(-1)?.due_date ?? "",
  }),
  statementPreview = (input) => ({
    computed_balance: "0.00",
    drift: input.outstanding_balance,
    within_rounding: false,
  }),
}: MortgageApiOptions = {}) {
  let registered = mortgage ?? null;
  let served = initialSchedule;
  let prepaymentList = [...prepayments];
  let statementList = [...statements];
  let nextId = 100;
  const notFound = () => problem(404, "Not Found", "no mortgage is registered");
  const unprocessable = (errors: FieldError[]) =>
    problem(422, "Unprocessable Entity", "validation failed", errors);
  const changed = () => {
    served = scheduleAfterChange ?? served;
  };

  const dateErrors = (date: string): FieldError[] =>
    registered && date < registered.contract_date
      ? [
          {
            location: "body.date",
            message: "must not be before the contract date",
            code: "before_contract",
          },
        ]
      : [];
  const prepaymentErrors = (input: PrepaymentInput): FieldError[] => [
    ...dateErrors(input.date),
    ...(Number(input.amount) > 0
      ? []
      : [
          {
            location: "body.amount",
            message: "must be greater than zero",
            code: "not_positive" as const,
          },
        ]),
  ];
  const statementTaken = (input: StatementInput, id?: number) =>
    statementList.some((s) => s.date === input.date && s.id !== id);
  const dateTaken = () => problem(409, "Conflict", "a statement is already recorded on this date");
  const prepaymentOf = (id: number, input: PrepaymentInput): PrepaymentOutcome => ({
    id,
    date: input.date,
    amount: input.amount,
    effect: input.effect,
    months_shortened: 0,
    installment_reduction: "0.00",
  });
  const statementOf = (id: number, input: StatementInput): StatementDrift => ({
    id,
    date: input.date,
    outstanding_balance: input.outstanding_balance,
    computed_balance: "0.00",
    drift: input.outstanding_balance,
    within_rounding: false,
  });
  const prepaymentBody = ({ id, date, amount, effect }: PrepaymentOutcome) => ({
    id,
    date,
    amount,
    effect,
  });
  const statementBody = ({ id, date, outstanding_balance }: StatementDrift) => ({
    id,
    date,
    outstanding_balance,
  });

  return stubRoutes({
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
    "POST /api/mortgage/schedule/preview": (req) => {
      const answer = onPreview?.(req.body) ?? initialSchedule;
      return answer instanceof Response ? answer : Response.json(answer);
    },
    "DELETE /api/mortgage": () => {
      if (!registered) return notFound();
      registered = null;
      prepaymentList = [];
      statementList = [];
      return new Response(null, { status: 204 });
    },
    "GET /api/mortgage/prepayments": () =>
      registered
        ? Response.json({
            prepayments: prepaymentList,
            total_amount: (
              prepaymentList.reduce((sum, p) => sum + cents(p.amount), 0) / 100
            ).toFixed(2),
            months_shortened: prepaymentList.reduce((sum, p) => sum + p.months_shortened, 0),
          })
        : notFound(),
    "POST /api/mortgage/prepayments": (req) => {
      if (!registered) return notFound();
      const input = req.body as PrepaymentInput;
      const errors = prepaymentErrors(input);
      if (errors.length > 0) return unprocessable(errors);
      const created = prepaymentOf(nextId++, input);
      prepaymentList = [...prepaymentList, created].sort(byDate);
      changed();
      return Response.json(prepaymentBody(created), { status: 201 });
    },
    "POST /api/mortgage/prepayments/preview": (req) => {
      if (!registered) return notFound();
      const input = req.body as PrepaymentPreviewInput;
      const errors = prepaymentErrors(input);
      if (errors.length > 0) return unprocessable(errors);
      return Response.json(prepaymentPreview(input));
    },
    "PUT /api/mortgage/prepayments/:id": (req, params) => {
      const id = Number(params.id);
      if (!prepaymentList.some((p) => p.id === id)) {
        return problem(404, "Not Found", "no such prepayment");
      }
      const input = req.body as PrepaymentInput;
      const errors = prepaymentErrors(input);
      if (errors.length > 0) return unprocessable(errors);
      const edited = prepaymentOf(id, input);
      prepaymentList = prepaymentList.map((p) => (p.id === id ? edited : p)).sort(byDate);
      changed();
      return Response.json(prepaymentBody(edited));
    },
    "DELETE /api/mortgage/prepayments/:id": (_req, params) => {
      const id = Number(params.id);
      if (!prepaymentList.some((p) => p.id === id)) {
        return problem(404, "Not Found", "no such prepayment");
      }
      prepaymentList = prepaymentList.filter((p) => p.id !== id);
      changed();
      return new Response(null, { status: 204 });
    },
    "GET /api/mortgage/statements": () =>
      registered ? Response.json({ statements: statementList }) : notFound(),
    "POST /api/mortgage/statements": (req) => {
      if (!registered) return notFound();
      const input = req.body as StatementInput;
      const errors = dateErrors(input.date);
      if (errors.length > 0) return unprocessable(errors);
      if (statementTaken(input)) return dateTaken();
      const created = statementOf(nextId++, input);
      statementList = [...statementList, created].sort(byDate);
      changed();
      return Response.json(statementBody(created), { status: 201 });
    },
    "POST /api/mortgage/statements/preview": (req) => {
      if (!registered) return notFound();
      const input = req.body as StatementPreviewInput;
      const errors = dateErrors(input.date);
      if (errors.length > 0) return unprocessable(errors);
      if (statementTaken(input, input.replaces)) return dateTaken();
      return Response.json(statementPreview(input));
    },
    "PUT /api/mortgage/statements/:id": (req, params) => {
      const id = Number(params.id);
      if (!statementList.some((s) => s.id === id)) {
        return problem(404, "Not Found", "no such statement");
      }
      const input = req.body as StatementInput;
      const errors = dateErrors(input.date);
      if (errors.length > 0) return unprocessable(errors);
      if (statementTaken(input, id)) return dateTaken();
      const edited = statementOf(id, input);
      statementList = statementList.map((s) => (s.id === id ? edited : s)).sort(byDate);
      changed();
      return Response.json(statementBody(edited));
    },
    "DELETE /api/mortgage/statements/:id": (_req, params) => {
      const id = Number(params.id);
      if (!statementList.some((s) => s.id === id)) {
        return problem(404, "Not Found", "no such statement");
      }
      statementList = statementList.filter((s) => s.id !== id);
      changed();
      return new Response(null, { status: 204 });
    },
  });
}
