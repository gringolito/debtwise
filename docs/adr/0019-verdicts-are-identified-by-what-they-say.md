# Verdicts are identified by what they say

A verdict is computed on each request and stored nowhere, as ADR-0016 has every figure that depends
on the history of the indexes, until the owner records his choice on it. Only then is it stored,
together with the prepayment, lot or sale he records from it, as a record of what DebtWise reported
when he chose. Nothing reads it back in place of a computed figure. Its ID is a SHA-256 digest of
what it says, so computing the same verdict again gives the same ID without storing anything.

## The verdict's ID

Every verdict with scenarios carries an ID, a decision's (ADR-0011) one per compared bond and an
early sale check's (ADR-0013) one per lot. The digest covers a canonical encoding of everything the
verdict reports: whether it comes from a decision or an early sale check, its date, which is always
today, the question (a decision's amount, effect and whether it prepays the slack, or a check's lot
and effect), the bond or lot it compared, every figure it gives down to each scenario's cash flows,
and the projection methods it names.

The market data's freshness is left out, so a refresh that changes no value the verdict read doesn't
make it a new one. Anything that changes what it reports does: a new quote or index value it reads,
another projection method, or a change to the terms or the recorded events.

## Recording a choice

The owner records his choice with a command on the verdict, one for each kind of comparison:
`POST /decisions/choices` and `POST /early-sale-checks/{lot}/choices`. The command carries the
question, the bond the verdict compared for a decision, the ID of the verdict the owner was shown,
and what he recorded, as he edited it in the pre-filled form: a lot or a prepayment for a decision,
a sale and its prepayment for a check. The option he took follows from what he recorded, so it isn't
sent apart.

The server refuses a command with a 409 when:

- **It is recorded already:** the ID is stored, so neither a double submit nor a repeat after a
  reload records anything twice.
- **The verdict changed since it was shown:** computing it again gives another ID, or no verdict at
  all, such as a check whose bond lost its sell quote. The screen then shows the current one.

Otherwise the verdict and every record it leads to are stored, each record carrying the verdict's
ID. Computing the verdict again, the checks and the writes run in one write transaction, so no
refresh, edit or second command lands between them, and the database holds each ID once. A lot is
sold once: a sold lot has no check, so a command on any check of it is refused as changed. A lot
bought from a decision and later sold from a check keeps both verdicts, one for each.

A computed verdict whose ID is stored says so, with the option the owner took, so the screens show
it as recorded instead of offering it again.

The owner can record either option of a verdict. A choice against it tells DebtWise that he saw it
and disagreed, which a verdict nobody acted on doesn't. A screen that offers to record from a
verdict offers both options, the favoured one first. Holding a lot records nothing, so an early sale
check's only choice is a sale, offered whichever option the check favours.

## What a stored verdict keeps

A stored verdict keeps its ID, its question, the bond or lot it compared, the figures the owner was
offered to record (a decision's buy rate, unit price and quantity, a check's sell unit price and net
proceeds), its advantage, the projection methods it named, the freshness of the market data it read
when the choice was recorded, and when that was. Its scenarios are left out, since telling which
verdicts the owner acted on doesn't need them. The records keep what he actually did: a figure he
changed in the form differs from the verdict's, and the record still counts as recorded from it.
Editing a record keeps its link. A record entered without a verdict never gets one.

A stored verdict lasts as long as a record it led to. Deleting the last of them deletes the verdict
too, since the owner is saying he didn't do it, and the same verdict can then be recorded again.

Stored verdicts belong to the single implicit owner (ADR-0002). Once there are several owners, a
verdict belongs to the owner who recorded the choice, and its ID is unique per owner.

## Consequences

- Buying a lot changes nothing a decision reads, so for the rest of the day, while the market data
  and the mortgage stay as they are, the dashboard shows a decision recorded as a lot as recorded.
  Recording a prepayment changes the mortgage, so the next decision is a new verdict that the owner
  can act on again.
- A change to how verdicts are computed or encoded changes their IDs. A verdict shown before it is
  refused as changed, and the screen shows the current one.
- This narrows #1's exclusion of "storing past Decision results as history": only the verdicts the
  owner records a choice on are kept.

## Considered Options

- **Storing every verdict when it is computed, under a new random ID:** rejected. The dashboard
  computes a decision on every visit and the investments page checks every lot, so most stored
  verdicts would never be acted on and would need a job to expire them. Reading the checks would
  also write. A reload would give the same verdict a new ID, which doesn't stop it being recorded
  twice. If a report of how often verdicts are followed ever needs the verdicts that were shown,
  they can be stored under the same IDs, one row per distinct verdict.
- **A signed token that carries the verdict back to the server:** rejected. It needs a secret the
  self-hosted server has to generate, keep and rotate, only to trust figures it can compute again
  in one comparison.
- **Trusting the figures the client sends back:** rejected. The stored verdict would be whatever the
  client said DebtWise reported, and the signal it exists for would be only as good as the client.
- **An ID from the question and a few headline figures:** rejected. Two verdicts can share the
  advantage and differ in their cash flows, such as after a change to the admin fee, and the stored
  figures would then be those computed when the owner acted rather than the ones he was shown.
- **A verdict ID on the existing create endpoints:** rejected. The owner's intent is to act on a
  verdict, not to create a lot, and a sale and its prepayment must be stored together or not at
  all, which two separate creates can't promise.
- **A key the client generates for each submit:** rejected. It stops a double submit of one form,
  but not a second record of the same verdict after a reload.
- **Recording only the option the verdict favours:** rejected. DebtWise would learn when the owner
  agreed, but not tell a verdict he disagreed with from one he ignored.
