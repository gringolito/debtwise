# DebtWise

DebtWise decides whether money is better spent prepaying a Brazilian home loan now or held in
Brazilian treasury bonds and used to prepay later. Portuguese names follow each term in parentheses.

## Writing an entry

An entry says what a term means, what it is for and where it is used, so that someone new to
DebtWise can use the word correctly. Keep it to one to three sentences, plus an example when the
meaning is easy to misread. Name the distinction that keeps it apart from a neighbouring term, and
list the words to avoid under _Avoid_, each with its reason.

Leave out how the term works: lists of values, level sequences, field or column names, status codes,
algorithms, thresholds and defaults. Those change as the project grows and belong in the ADRs,
project docs or the API contract. An entry that has to change whenever one of them does is holding
detail it shouldn't.

Add a term when it has a specific meaning in the project and shows up in code, UI or conversation.
Leave out general programming concepts. Update an entry when the meaning of its term changes, not
when its values, structure or implementation do. Each change to this file should leave every entry
it touches following these rules.

## Language

Terms are capitalized in this file only to mark them as defined here. They are common nouns, not
proper names. Everywhere else, in comments, docs, API descriptions, UI copy and commit messages,
write them in lowercase like any other word and capitalize the first letter only where a sentence,
heading or label starts: "the avoided cost", "a mortgage", a page titled "Amortization system".
Identifiers follow their language's naming rules. DebtWise is the project's name and stays
capitalized.

### Mortgage

**Mortgage** (financiamento imobiliário):
The home loan whose prepayment DebtWise weighs against investing. Its conditions are always the
owner's inputs, never assumptions built into DebtWise.
_Avoid_: Loan (also covers loans DebtWise doesn't model), financing (names the act of borrowing,
not the contract), debt (too broad; what is still owed is the outstanding balance)

**Amortization System** (sistema de amortização):
The contract rule that splits each installment into amortization and interest. It decides how a
prepayment changes the installments that follow.
_Avoid_: Amortization table (names one system's output, not the rule)

**Contract Rate** (taxa de juros do contrato):
The annual interest rate a mortgage contract charges on the outstanding balance, on top of any
indexer correction. A contract prints it as nominal or as effective, two ways of writing the same
rate.
_Avoid_: Interest rate (also covers bond rates), CET (the total cost rate, which includes insurance
and fees)

**Indexer** (indexador):
The index a mortgage contract uses to correct the outstanding balance before interest is charged.
Unlike the contract rate, it follows published data month by month, which is what makes a
mortgage's future cost uncertain.
_Avoid_: Correction (names the effect, not the index), index (any published series; the indexer is
the one a contract uses)

**Poupança Yield** (remuneração da poupança):
The legally defined return of a savings account, which some mortgages use as their indexer. It
moves with other indexes, so projecting it means projecting them.
_Avoid_: Poupança (the account itself, not its return), savings rate (reads as how much a person
saves)

**Outstanding Balance** (saldo devedor):
The amount still owed on the mortgage on a date, after the indexer correction. Prepayments reduce
it, and comparisons measure their scenarios by it.
_Avoid_: Debt (also covers interest and fees not yet charged), principal (the amount originally
borrowed, not what is owed now)

**Installment** (prestação):
One scheduled monthly payment on the mortgage, with everything the bank charges that month
included. It is what the owner pays out of pocket each month.
_Avoid_: Payment (also covers prepayments), parcel (a mistranslation of "parcela")

**Schedule** (evolução do financiamento):
The mortgage's installments month by month, each with what it charges and the outstanding balance
it leaves. The owner checks it against the bank's statements.
_Avoid_: Amortization table (names the amortization system's split only), extrato (the bank's
statement, not DebtWise's calculation)

**MIP** (Morte e Invalidez Permanente):
The mortgage's life and disability insurance premium, charged with each installment on the
outstanding balance. Its rate follows the borrower's age band.
_Avoid_: Life insurance (the policy, not the premium charged), seguro habitacional (covers MIP and
DFI together)

**DFI** (Danos Físicos ao Imóvel):
The mortgage's property damage insurance premium, charged with each installment on the appraisal
value. Unlike MIP, it doesn't fall as the outstanding balance does.
_Avoid_: Property insurance (the policy, not the premium charged), home insurance (an optional
policy the owner may hold apart from the mortgage)

**Appraisal Value** (valor de avaliação):
The bank's valuation of the property behind a mortgage. DFI is charged on it.
_Avoid_: Property value (what the property would sell for), market value (a lot's sale value in
DebtWise), purchase price (what the owner paid)

**Admin Fee** (taxa de administração):
The fixed monthly fee the bank charges with each installment for managing the mortgage.
_Avoid_: Custody fee (charged by B3 on bonds), tarifa (any bank fee, not this one)

**Prepayment** (amortização extraordinária):
A payment against the outstanding balance outside the schedule, which either shortens the term or
lowers later installments. It is the option DebtWise weighs against buying a bond.
_Avoid_: Early payment (sounds like paying an installment ahead of time), fast-track and paydown
(informal, with no fixed meaning)

**Avoided Cost**:
What a prepayment saves between its date and a later date: everything the prepaid amount would
have cost while it stayed owed. For example, prepaying R$ 30,000 avoids the indexer correction on
that R$ 30,000 as well as the interest on it.
_Avoid_: Interest saved and juros (leave out the indexer correction, insurance and fees)

**Statement** (extrato):
The outstanding balance the bank reports on a date. DebtWise trusts it over its own calculation
from that date on.
_Avoid_: Snapshot (doesn't say the figure comes from the bank), balance (the computed balance is a
different figure)

### Investments

**Bond** (título):
A Tesouro Direto security that DebtWise can compare against a prepayment. ADR-0007 sets which
bonds qualify, by the mortgage's indexer.
_Avoid_: Investment (also the act of investing), asset (too broad), título público (also covers
bonds DebtWise doesn't compare)

**Lot**:
One purchase of a bond on one date at one rate. Lots of the same bond stay apart because their tax
and their early sale checks differ.
_Avoid_: Investment (also the act of investing), position (all the lots of a bond together),
aporte (the money put in, not what it bought)

**Coupon** (cupom):
An interest payment a bond makes before maturity. It is cash that comes back early, which a
comparison has to put somewhere.
_Avoid_: Dividend (an equity term), interest (also the mortgage's interest)

**Accrual Value** (valor na curva):
A lot's value grown at its contracted rate up to a date, as if the market never moved. It differs
from the market value whenever rates have changed since the purchase.
_Avoid_: Book value (an accounting term with its own rules)

**Market Value** (valor a mercado):
What a lot would fetch if sold on a date, at the bond's sell price then. It is the sell side of an
early sale check.
_Avoid_: Current value (could mean the accrual value too), sale price (quoted per bond, not per
lot)

**Maturity Value** (valor no vencimento):
What a lot pays when its bond matures. It is the hold side of every comparison.
_Avoid_: Face value (per bond and before tax)

**Custody Fee** (taxa de custódia):
The fee B3 charges for keeping bonds in Tesouro Direto. It reduces what a lot returns.
_Avoid_: Admin fee (the mortgage's monthly fee), brokerage (charged by brokers, not by B3)

### Comparison

**Decision**:
A forward-looking comparison of prepaying an amount on a date against buying a bond with it. It
answers "what should I do with this money?", while the early sale check asks the same of a lot
already held.
_Avoid_: Simulation (suggests free-form what-ifs), recommendation (DebtWise reports; the owner
decides)

**Early Sale Check**:
A comparison, for a lot already held, of selling it now and prepaying with the proceeds against
holding it to maturity and prepaying then. It is how the owner takes a gain when rates have fallen.
_Avoid_: Early redemption and resgate antecipado (name the sale itself, not the comparison)

**Horizon**:
The date a comparison measures both its scenarios on, set by the bond being compared. Measuring
both on one date is what makes them comparable.
_Avoid_: Maturity (a property of the bond; the horizon belongs to the comparison), deadline (implies
something is due)

**Equal Outflow**:
The rule that both compared scenarios cost the owner the same out of pocket every month, with any
cash that frees up going to the mortgage. It spares a comparison from guessing what freed cash
would earn elsewhere.
_Avoid_: Same budget (doesn't say where freed cash goes)

**Advantage**:
How much better off the owner is on the horizon by investing instead of prepaying, in money. A
positive advantage favours investing, a negative one prepaying.
_Avoid_: Gain and profit (sound like a bond's return, not a difference between scenarios), ganho
financeiro (the old spreadsheet's figure, computed differently)

**Break-even Rate**:
The bond rate at which investing and prepaying come out even. Comparing it with the rate on offer
shows how much margin a bond gives.
_Avoid_: Hurdle rate (a corporate-finance term with a wider meaning)

### Market data

**Index** (índice):
A published Brazilian economic series that a mortgage or a comparison depends on. An indexer is
the index one mortgage contract uses.
_Avoid_: Rate (one value, where an index is a series over time)

**Business Day** (dia útil):
A day on which bond interest accrues under the Brazilian market calendar. Bond prices and holding
periods count business days, while the mortgage counts months.
_Avoid_: Working day (follows local holidays, not the market's)
