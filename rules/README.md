# The rulebook

This directory is the asset the rest of the tool rests on. Everything else — the
MCP server, the checks, the reports — is a way of reading these files aloud.

**The central idea: the linter is the curriculum.** No finding may be a bare
pass/fail. Every rule carries four things, and the loader refuses to load one
that is missing any of them:

| Field | The question it answers |
|---|---|
| `what_it_is` | **WHAT** — the observable thing, described so you could point at it |
| `why_it_matters` | **WHY** — the consequence, preferably the mechanism rather than the adjective |
| `source` | **WHO SAYS SO** — a named source, with its confidence tag |
| `fix` | **WHAT TO DO** — the better move, concrete enough to apply |

Plus `teach`: two or three sentences a complete beginner can read, with every
technical word either avoided or explained in place. That field is the reason the
rulebook exists in this shape. A score tells you where you stand. An annotation
tells you why, and the second one is the one you learn from.

---

## Reading a rule

```
rules/
  sources.json      the 21 named sources, what class of evidence each offers,
                    and what is wrong with each of them
  schema.json       the shape of a rule, with the reasoning for each field
  01-instant.json   Tier 1 — clocked in under five seconds, no vocabulary needed
  02-felt.json      Tier 2 — felt rather than named, but decisive
  03-copy.json      Tier 3 — the words
  04-honesty.json   is what the page says true, and can it be checked
  05-floor.json     the mobile and accessibility floor: broken, not ugly
  06-typography.json
  07-color.json
  08-structure.json what sections exist, in what order
  09-material.json  texture, images, physical quality in code
  10-trap-tier.json currently reads as sophisticated, will not — carries expiry
  11-variety-ledger.json  the cross-build rules, and the design behind them
```

And the machinery that makes the data executable:

```
  index.js          loads the rulebook and refuses to load a broken one
  engine.js         the detector evaluators, and the expiry policy
  page.js           the parsed page every detector reads from
  color-space.js    OKLCH, because several thresholds are stated in it
  fingerprint.js    the six variety facets
  ledger.js         the variety ledger: read, write, compare
  validate.js       run the whole rulebook over a directory and print the table
```

---

## The provenance discipline

The corpus this was distilled from tags every claim, and the rulebook inherits
that discipline rather than flattening it:

| Tag | Meaning |
|---|---|
| **DEMONSTRATED** | runnable code, production CSS, a live comparator, or a counted sample |
| **MEASURED_HERE** | produced by inspecting real artifacts, with the command recorded |
| **ADJUDICATED** | two sources disagreed and the corpus settled it against a stored artifact |
| **ASSERTED** | expert opinion, blog prose, forum anecdote, or reasoning |
| **INFERRED** | a conclusion the corpus drew itself and flagged as inference |

Three enforcement rules, checked at load time:

1. **A rule whose source is not in `sources.json` does not load.** A rule with no
   provenance is not shippable.
2. **An ASSERTED or INFERRED rule must carry a `confidence_note`** saying plainly
   what is not proven. Twenty of these were added only because the loader refused
   the rulebook without them.
3. **An ASSERTED rule may not be severity `fail`** unless the corpus itself gates
   on it. Do not launder a hypothesis into a hard gate.

There is a fourth field that matters as much and is easy to miss:
`threshold_provenance`. The RULE and the NUMBER often come from different places.

- `from_source` — the cited source published this number.
- `calibrated_here` — the source named the tell without a number, and the number
  was fitted against the preview corpus. The rule says how it was fitted.
- `arithmetic` — defensible reasoning; nobody published it. The corpus's own
  cautionary case is a 45ms stagger interval that its author shipped while
  writing, in the same file, that no practitioner source for it exists.

---

## Two rules that needed designing rather than transcribing

### The variety ledger

The corpus names the deepest tell: *every site you ship shares a skeleton*, and it
prescribes a ledger that records what was emitted last rather than a menu of
options. Its own measurement was a sha256 of the `<style>` block across thirteen
pages, giving two distinct values.

**A raw hash is the wrong instrument.** Two hashes across thirteen pages looks
like variation and is not — the only difference between the two groups was three
hex values. So the primary facet here strips every declaration *value* out of the
CSS and hashes only selectors and property names. A generator that changes colours
produces no change in that hash, which is correct, because changing colours
changes nothing structural.

Six facets, three hashed and three compared as vectors: `skeleton`,
`style_skeleton`, `boilerplate`, `palette`, `type`, `geometry`. The full design —
what each one is blind to, what it is sensitive to, where the ledger lives and why
it lives outside the project — is in `11-variety-ledger.json` under `design`.

### The trap tier

Some of these rules are time-limited by construction. Cream grounds and emerald
accents read as sophisticated today because they are the current escape from
purple, and being the escape hatch is what burns an escape hatch.

So those rules carry `burned_on`, `review_by` and `decay`, and `engine.js`
enforces them rather than documenting them:

- past `review_by` → severity downgraded to `info`, and the finding says the rule
  is unreviewed and how long it has been;
- past `review_by + 180 days` → the rule is **suspended** and not evaluated at
  all, because a taste rule two cycles stale is worse than no rule.

The clearest case in the file is `TRAP-BENTO`. One research file selected the bento
grid in August 2026 *because* it reads as 2026. Another, written the same month,
recorded the correction: in 2026, "reads as 2026" and "reads as AI-generated" are
the same set, because the AI generators are what standardised 2026. Both files are
in the corpus. The later one wins, and the rule records the disagreement rather
than resolving it silently.

---

## Running it

```bash
node rules/validate.js <directory-of-html>          # the table
node rules/validate.js <dir> --json                 # machine-readable
node rules/validate.js <dir> --rule T1-EMOJI-ICON   # one rule
```

Every rule carries a `measured` block recording what it actually found over
`local-site-forge/previews/` — thirteen real generated pages the research already
proved slop-ridden. Those numbers are written by `validate.js`, not typed by hand,
so the rulebook's claims about the corpus cannot drift from what the detectors do.

**A rulebook that finds nothing in a corpus already proven slop-ridden is wrong,
and this is where that is checked rather than asserted.** Running it also caught
three of this rulebook's own errors before they shipped: a shadow parser that read
a bare `0` offset as a missing blur (26 false positives, and it suppressed a real
finding), a hero-metric detector that fired on the digits of a phone number (42
false positives), and a gradient-pair detector that read a single-hue gradient as a
two-hue cliché. All three are recorded in the `measured` notes of the rules they
affected rather than quietly fixed.

## Two kinds of check that never run automatically

`browser` needs a live render. `manual` needs a person or a vision model. Both
return `not_run` with a reason instead of passing.

That is deliberate. A checker that quietly passes what it cannot test is worse than
one that admits the gap — and the gaps here are not small. Whether the photograph
is *your* photograph, whether the section list was chosen for *this* trade, and
whether each sentence could be shown to be false are the three most consequential
questions in the whole rulebook, and none of them is automatable.
