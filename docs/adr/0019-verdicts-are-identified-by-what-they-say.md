# Verdicts are identified by what they say

A verdict is stored only once the owner records his choice on it, together with the prepayment, lot
or sale he records from it. Until then it is computed on each request, as ADR-0016 has every figure
that depends on the history of the indexes, and stored nowhere. Its ID is a SHA-256 digest of what
it says, so computing the same verdict again gives the same ID without storing anything.

## The verdict's ID

Every verdict with scenarios carries an ID, a decision's (ADR-0011) one per compared bond and an
early sale check's (ADR-0013) one per lot. The digest covers:

- **The question:** whether it is a decision or an early sale check, its date, which is always
  today, and what the owner asked: a decision's amount, effect and whether it prepays the slack, or
  a check's lot and effect.
- **What it compared:** a decision's bond, by type and maturity, its buy rate, unit price and
  quantity, or a check's sell unit price and the net proceeds its sell scenario prepays.
- **The answer:** the advantage and the projection method of each index it read.

The market data's freshness is left out, so a refresh that changes no value it read doesn't make it
a new verdict. Anything that changes what it says does: a new quote, a new index value it reads,
another projection method, or a change to the terms or the recorded events.

## Recording a choice

The owner records his choice with a command on the verdict, one for each kind of comparison:
`POST /decisions/choices` and `POST /early-sale-checks/{lot}/choices`. The command carries the
question, the ID of the verdict the owner was shown, and what he recorded, as he edited it in the
pre-filled form: a lot or a prepayment for a decision, a sale and its prepayment for a check. The
option he took follows from what he recorded, so it isn't sent apart.

The server computes the verdict again from the question and compares its ID with the one sent. A
different ID means the verdict changed since it was shown, and the command is refused with a 409 so
the screen can show the current one. Otherwise the verdict and every record it leads to are stored
in one transaction, each record carrying the verdict's ID. A verdict is stored once: a second
command on the same ID is refused with a 409, so neither a double submit nor a repeat after a reload
records anything twice. A computed verdict whose ID is stored says so, with the option the owner
took, so the screens show it as recorded instead of offering it again.

The owner can record either option of a verdict, not only the one its advantage favours. A choice
against the verdict tells DebtWise that he saw it and disagreed, which a verdict nobody acted on
doesn't. Holding a lot records nothing, so an early sale check's only choice is a sale, whichever
option it favours.

## What a stored verdict keeps

A stored verdict keeps everything its ID covers, the freshness of the market data it read when the
choice was recorded, and when that was. The records keep what the owner actually did: a figure he
changed in the form differs from the verdict's, and the record still counts as recorded from it.
Editing a record keeps its link. A record entered without a verdict never gets one.

A stored verdict lasts as long as a record it led to. Deleting the last of them deletes the verdict
too, since the owner is saying he didn't do it, and the same verdict can then be recorded again.

Stored verdicts belong to the single implicit owner (ADR-0002). Once there are several owners, a
verdict belongs to the owner who recorded the choice, and its ID is unique per owner.

## Consequences

- A verdict recorded as a lot is computed again with the same figures, since buying a lot changes
  nothing a decision reads, so the dashboard shows it as recorded until the market data or the
  mortgage changes. A verdict recorded as a prepayment changes the mortgage, so the next decision
  is a new verdict that the owner can act on again.
- A change to how verdicts are computed changes their IDs. A verdict shown before the change is
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
- **An ID from the question alone, without the answer:** rejected. The stored figures would be those
  computed when the owner acted, which can differ from the ones he was shown if the market data
  changed in between.
- **A verdict ID on the existing create endpoints:** rejected. The owner's intent is to act on a
  verdict, not to create a lot, and a sale and its prepayment must be stored together or not at
  all, which two separate creates can't promise.
- **A key the client generates for each submit:** rejected. It stops a double submit of one form,
  but not a second record of the same verdict after a reload.
- **Recording only the option the verdict favours:** rejected. DebtWise would learn when the owner
  agreed, but not tell a verdict he disagreed with from one he ignored.
