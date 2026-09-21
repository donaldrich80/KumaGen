<!--
Vendored from the design-principles repo — do not edit here.
Upstream: principles/decision-docs.md
Source commit: d733224908fd66931fb53d0ede75c8d319825115
Canonical: git@github-personal:donaldrich80/design-principles.git
Check drift: ~/Projects/design-principles/scripts/check-sync.sh docs/decision-docs.md
-->

<!--
Provenance: drafted 2026-09-06 from observed decision scars in
`app-awesome`. The canonical example is
`docs/embedding-options-analysis.md` — a 200-line decision doc
that compares five embedding options (OpenAI small/large, local
MiniLM, local MPNet, plus alternatives) across six dimensions
(quality, cost, speed, privacy, setup, dimensions), models cost at
four scales (1k, 10k, 100k, 1M READMEs), runs empirical quality
benchmarks on real queries, and frames the recommendation as a
"choose X if conditions A/B/C, choose Y if conditions D/E/F"
decision framework rather than a winner declaration.

The principle sharpens `principles/hub-projects.md` §14 (every unit
ships a committed spec, including tool-selection rationale).
§14 says "record why"; this principle says "here is what *why*
looks like when the choice has multiple defensible answers across
multiple scales."

Last reviewed: 2026-09-06.
-->

# Decision docs before commitment

Non-trivial infrastructure choices — embedding models, vector stores, AI providers,
database engines, queue systems, auth providers, deployment targets — have multiple
defensible answers that look very different at different scales. The "right" choice for
1,000 records is rarely the right choice for 1,000,000. The "right" choice for a privacy-
sensitive workload is rarely the right choice for a cost-sensitive one. The discipline
here is to **document the decision before committing**, comparing options across stable
dimensions at multiple scales, and framing the choice as a *framework* the reader can
re-evaluate when their conditions change — not as a winner they have to defend later.

This is a sharpening of [`principles/hub-projects.md`](hub-projects.md) §14 (every unit
ships a committed spec, including tool-selection rationale). §14 says "record why" —
this principle says "here is what *why* looks like when the choice has real trade-offs
and the trade-offs shift with scale."

---

## 1. For non-trivial choices, write a decision doc *before* committing

When the choice is reversible later (a config flag, a CLI flag, a one-line swap), no
doc is needed — flip the flag, move on. When the choice involves data migration,
vendor contract, model retraining, or a weeks-long rewrite to undo, write it down
*before* you commit. The doc is the artifact that survives the moment of choice and
can be re-litigated later without re-deriving from memory.

**Rule:** the doc lives next to the system it describes (`docs/` in the same repo,
named `*-decision.md` or `*-analysis.md`), is reviewed as part of the implementation
PR (not after), and is referenced by the implementation spec that follows. It is
**not** a wiki page nobody reads, **not** a comment in the code, **not** a Slack
thread that scrolls away.

**Observed:** `app-awesome/docs/embedding-options-analysis.md` was written *before*
the embedding implementation was committed. The implementation PR referenced the
analysis ("going with local MiniLM per the cost/privacy trade-off in
embedding-options-analysis.md"). Six months later, when scale changed, the doc
was the artifact the team returned to — not a Slack scrollback or a fuzzy memory.

## 2. Compare at least 3 viable options across the same dimensions

A "decision" between two options is a coin flip dressed up; a "decision" between five
options is a survey. Three is the minimum that surfaces the trade-off shape. With
two options, the doc reads as advocacy for one of them. With three or more, the
shared dimensions (cost, quality, privacy, speed, maintenance) reveal what each
option optimizes for and what it sacrifices.

**Rule:** the comparison table has the same column set for every option, and the
columns are dimensions the *deployment* cares about, not dimensions the vendor
emphasizes. A canonical column set:

| Aspect | Option A | Option B | Option C |
|---|---|---|---|
| **Quality** | score or rating | score or rating | score or rating |
| **Cost** | $/unit, $/month, $/year at scale X | same | same |
| **Speed** | latency p50, throughput | same | same |
| **Privacy** | data leaves infra? | same | same |
| **Setup** | complexity, time-to-first-use | same | same |
| **Maintenance** | model updates, dependency churn | same | same |

The table is the spine of the doc. Prose elaborates; the table is the artifact that
can be re-read in 30 seconds.

**Observed:** `app-awesome` embedding-options-analysis has the six-column table
above as its first content block, before any prose argument. The reader can
internalize the trade-off shape from the table alone.

## 3. Model cost at multiple scales — the choice that wins at 1k often loses at 100k

The same comparison at one scale misleads. Local embeddings are free at any scale,
but their setup cost is paid once. OpenAI's per-token cost looks trivial at 1k
READMEs and significant at 1M. A cost analysis at one scale is a snapshot; a cost
analysis at four scales is a model.

**Rule:** the cost section has at least three scale scenarios, named concretely:

- **Startup** (1k records / 100 users / single-region)
- **Medium** (10k records / 1k users)
- **Large** (100k records / 100k users / multi-region)
- **Enterprise** (1M+ records) — *optional*, but cheap to add and useful when the
  reader's scale might cross it

For each scenario, the table shows initial cost, monthly cost, and year-1 total.
The winner per scenario is named explicitly, because the answer often changes:

| Approach | Startup (1k) | Medium (10k) | Large (100k) | Enterprise (1M) |
|---|---|---|---|---|
| OpenAI small | $0.04 | $0.40 | $4 | $88 |
| Local CPU | $0 | $0 | $0 | $0* |
| Local GPU | — | $500 | $3,200 | $10,000+ |

`*` at enterprise scale, "local $0" becomes "local can't keep up."

**Observed:** `app-awesome` cost-analysis section models exactly these four scales.
The recommendation changes: "local wins at startup, OpenAI small wins at 10k–100k,
local-on-dedicated-cluster comes back at 1M." A reader at any of those scales sees
their relevant row.

## 4. Quality is empirically measured where possible

"Best quality" in vendor marketing is not "best quality" in production. A decision
doc that asserts quality without measurements is opinion. A decision doc that
includes 3–5 real queries with relevance scores per option is evidence.

**Rule:** when quality differs across options, include a **benchmarks on real
queries**, not paper benchmarks. Three to five queries from the actual domain, with
the top match and relevance score per option:

| Query | OpenAI large | OpenAI small | Local MPNet | Local MiniLM | Keyword |
|---|---|---|---|---|---|
| "convert config files between formats" | yq (0.94) | yq (0.91) | yq (0.88) | yq (0.82) | N/A (0.30) |
| "testing framework for JavaScript" | Jest (0.96) | Jest (0.94) | Jest (0.92) | Jest (0.89) | various (0.65) |

The reader sees the *shape* of the difference — "OpenAI large is 5% better than
local MPNet, both crush keyword" — not a single number that hides variance.

**Observed:** `app-awesome` quality comparison uses two real queries and surfaces
the 5%-vs-60% gap as the headline insight. The qualitative takeaway ("for dev-tool
search, the OpenAI-vs-local gap is small, but semantic-vs-keyword is huge") is
defensible because the numbers are right there.

## 5. Frame the recommendation as a choose-X-if framework, not a winner declaration

A winner declaration is fragile: the moment conditions change, the winner is wrong
and the doc has to be re-defended. A framework is durable: the conditions are stated
explicitly, and the reader can re-evaluate against their own conditions without
re-litigating the comparison.

**Rule:** the recommendation section ends with a per-option "choose this if" block:

```markdown
### Choose OpenAI (text-embedding-3-small) if:
- [ ] You want results in 10 minutes
- [ ] Data privacy is not a concern
- [ ] You expect < 100K records
- [ ] You don't want infrastructure overhead
- [ ] You need multilingual support
- [ ] You want best possible quality

### Choose Local (all-MiniLM-L6-v2) if:
- [ ] Data privacy is critical
- [ ] You want zero ongoing costs
- [ ] You already have Python/ML infrastructure
- [ ] You need offline operation
- [ ] You expect > 100K records
```

The checklist form is not aesthetic — it forces the writer to enumerate the
conditions, and the reader to check the ones that apply. A vague recommendation
("we recommend OpenAI for ease") can't be re-evaluated against a specific
deployment's conditions. A checklist can.

**Observed:** `app-awesome` recommendation section uses this exact shape. The
final recommendation ("start with local embeddings; add OpenAI as fallback later")
is the writer's choice for *their* conditions, but the framework above it lets a
different reader reach a different conclusion without re-doing the analysis.

## 6. Re-evaluation is triggered by material change in any dimension

A decision doc is a snapshot. The doc itself should state what would trigger a
re-evaluation — a 10× scale change, a new option entering the market, a quality
bar moving, a privacy requirement shift. Without this, the doc is a tombstone:
true at one point in time, never revisited.

**Rule:** the doc ends with a "Re-evaluate when" block:

```markdown
## Re-evaluate when:
- Scale crosses one of the modeled scenarios (e.g., 10k → 100k)
- A new option enters the comparison set (e.g., a new embedding model)
- Quality requirements change (e.g., new domain where local gap matters more)
- Cost structure changes (e.g., a vendor price drop or privacy regulation)
```

**Observed:** `app-awesome` doc does not have an explicit "re-evaluate when" block
(yet). The rule above is the missing piece — the principle says the doc *must*
have it, even if the canonical example doesn't.

---

## Checklist

- [ ] Doc lives next to the system it describes, is reviewed with the implementation PR, and is referenced by the spec that follows
- [ ] At least 3 options compared across the same dimensions (quality, cost, speed, privacy, setup, maintenance)
- [ ] Cost modeled at 3+ scales (startup / medium / large, optionally enterprise)
- [ ] Quality empirically measured on 3+ real queries with relevance scores per option
- [ ] Recommendation framed as "choose X if conditions A/B/C, choose Y if conditions D/E/F" — checklist form, not a winner declaration
- [ ] Doc ends with an explicit "re-evaluate when" block naming the trigger conditions

## Consumed by

- **`app-awesome`** — `docs/embedding-options-analysis.md` is the
  canonical example. Five options compared across six dimensions,
  cost modeled at four scales, quality measured on real queries,
  recommendation framed as a checklist of conditions. The doc
  predated the implementation by enough that the implementation
  PR could cite it as the rationale.
- **`app-clidoc`** → `docs/decision-docs.md` (vendored 2026-09-21). Its
  `docs/output-integrations.md` is a standing multi-option comparison of
  publisher destinations; this is the shape it should take before a third
  destination lands.
- **`app-kumagen`** → `docs/decision-docs.md` (vendored 2026-09-21). Per-run
  provider/model selection for AI-driven config generation is the
  multi-scale cost/quality choice this principle governs.
