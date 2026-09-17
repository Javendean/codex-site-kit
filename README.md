# codex-site-kit

An MCP server for [Codex](https://chatgpt.com/codex). It builds small websites with no
framework and no build step, and it criticises them the way a coach annotates a game.

**Every finding carries four things and never fewer:** what was found, with the measurement ·
why it is worse than the alternative · who says so, by name, with a confidence tag · and the
better move. Nothing comes back as a bare pass or fail, because a pass/fail teaches you nothing
and this tool is trying to teach you something.

Findings are annotated in chess notation, which is not decoration — severity needs a vocabulary,
and if you read one already this is the one:

| | Means |
|---|---|
| `??` | A blunder. Somebody with no design vocabulary at all spots it in five seconds, on a phone. |
| `?` | A mistake. Felt rather than named, and decisive. |
| `?!` | An inaccuracy. A habit worth dropping; rarely fatal on its own. |
| `!?` | The trap tier. Reads as sophisticated today and will not next year. Reported as a question, not a verdict. |
| `!` | A good move. Something the page already does right, and why. |

---

## Installing it on a Mac

Three commands. You do not need Homebrew, you do not need to know what a terminal is, and
nothing below asks you to fix anything.

**Open Terminal first.** Press `⌘ Space`, type `Terminal`, press Return. A window appears with
some text and a blinking cursor. Everything below is typed into that window, one line at a
time, pressing Return after each.

### 1. Install Codex

```bash
curl -fsSL https://chatgpt.com/codex/install.sh | sh
```

**What you should see:** a few lines of progress, then a line telling you Codex has been
installed and, usually, where. It finishes in under a minute.

**Then close the Terminal window and open a new one.** The installer puts `codex` somewhere your
current window does not know about yet; a new window picks it up. Check it took:

```bash
codex --version
```

**What you should see:** a version number, such as `codex-cli 0.5.0`. If you instead see
`command not found: codex`, close Terminal completely (`⌘ Q`) and open it again.

### 2. Install Node

Codex does not need Node. This kit does — it is written in JavaScript and Node is what runs it.

Go to **<https://nodejs.org>** and click the button offering the **LTS** version. It downloads a
file ending in `.pkg`. Double-click it and click Continue until it says Install. That is the
whole installation.

> **Not Homebrew.** You will find instructions telling you to install Homebrew first and then
> use it to install Node. Do not. Homebrew is a package manager that has to be installed and
> maintained itself, and it is a second thing to go wrong before you have made your first web
> page. The `.pkg` from nodejs.org is the same software with none of that.

Back in Terminal (a new window again, after installing):

```bash
node --version
```

**What you should see:** a version number starting with `v20`, `v22` or higher — anything at
`v18.17` or above works.

### 3. Add this kit to Codex

```bash
codex mcp add site-kit -- npx -y github:Javendean/codex-site-kit
```

**What you should see:** a short confirmation that the server `site-kit` was added. Nothing
downloads yet; that happens the first time Codex starts it.

Check it is registered:

```bash
codex mcp list
```

**What you should see:** a list with `site-kit` in it, and next to it the command
`npx -y github:Javendean/codex-site-kit`.

### 4. Use it

```bash
codex
```

Then type, in ordinary English:

> Make me a website about the chess lessons I teach. Then review it and explain what is wrong.

The first run takes about half a minute while `npx` fetches the package. After that it is
instant. There is no build step, nothing to compile, and no configuration file to edit.

---

## If something goes wrong

One command diagnoses everything:

```bash
npx -y github:Javendean/codex-site-kit doctor
```

It checks your Node version, whether the package loads, whether every tool registers, and
whether the optional browser for `check_responsive` is present — and for anything that fails it
prints the exact command that fixes it. It never prints a stack trace.

**The two failures worth knowing in advance:**

- **`command not found: codex`** — you have not opened a new Terminal window since installing.
  Press `⌘ Q` to quit Terminal completely, then open it again.
- **Codex says the server failed to start** — almost always Node missing or too old. Run
  `node --version`. If it prints nothing, go back to step 2.

### Where the config lives, if you ever want to look

`codex mcp add` writes to `~/.codex/config.toml`. The entry it makes looks like this, and you
can also write it by hand:

```toml
[mcp_servers.site-kit]
command = "npx"
args = ["-y", "github:Javendean/codex-site-kit"]

[mcp_servers.site-kit.env]
# nothing needed
```

---

## What it will not do

Stated plainly, because a tool that hides its limits is worse than one that has fewer of them.

- **No telemetry, ever.** Nothing about you, your machine or your sites leaves the computer.
- **No network calls.** Not one tool fetches anything. The rulebook is a set of files in this
  package, and it is read off disk.
- **No secrets, no accounts, no API keys.** There is nothing to configure.
- **It does not render your page.** Most rules read the source text, which is enough for most
  of them and not enough for a few. Sideways scroll on a phone, a button label wrapping to two
  lines, the real contrast of a colour after the cascade resolves: those need a browser, and
  `check_responsive` measures them. When it cannot, it reports **skipped** and the command that
  installs the browser. **A skipped check is never reported as a pass.**
- **It cannot tell you whether a page looks dated.** Technical age is parseable and is covered.
  Aesthetic age needs a screenshot and a vision model. No amount of text parsing substitutes,
  and the tool says so rather than letting a clean report imply otherwise.

The only optional extra is a browser for `check_responsive`, and only when you want it:

```bash
npx playwright install chromium
```

---

## The twelve tools

| Tool | What it is for |
|---|---|
| `learning_path` | The route from never having made a website to understanding one. Ten stops, generated from the rulebook. **Start here.** |
| `init_site` | Scaffold a complete working site. No framework, no build step; double-clicking `index.html` opens a finished page. |
| `palette_from_image` | Read the real colours off a photograph of the subject, with a WCAG contrast matrix. |
| `palette_from_subject` | Derive a palette when there is no photograph yet. |
| `review_site` | The whole rulebook, as an annotated critique. The one worth knowing about. |
| `explain_rule` | The full teaching note behind any finding: the threshold, the reasoning, the sources, the confidence. |
| `check_copy` | Just the words, so you can edit the writing without the page in front of you. |
| `check_responsive` | Loads real pages in a real browser and reports actual pixel numbers. |
| `check_honesty` | Invented testimonials, ratings, counts, and quotations carrying names nobody checked. |
| `check_assets` | Every file the site points at, and whether it exists. |
| `check_single_source` | Values written down in more than one place. A price in two files is two prices. |
| `doctor` | What is wrong with this machine, and the command that fixes it. |

---

## Why the rules are what they are

Every rule in this kit names its source, and the kit **refuses to load a rule that does not** —
provenance is a startup error here, not a habit. [`RULES.md`](RULES.md) is the index; run
`explain_rule` on any id for the full note.

Each source carries the confidence tag the research gave it:

| Tag | Meaning |
|---|---|
| **DEMONSTRATED** | The source ships runnable code, a live comparator, production library CSS, or a counted sample. Verifiable without trusting anyone. |
| **MEASURED** | Produced by inspecting real files, reproducibly. |
| **ASSERTED** | Expert opinion, blog prose, or forum anecdote. May be right; is not evidence. |

**This distinction is load-bearing.** Where the research says ASSERTED, the tool reports the
finding as a *question about your page* rather than as a gate it failed, and says so in the
output. A hypothesis laundered into a hard gate is exactly the failure the kit exists to avoid.
Where a source has a caveat — a self-reported false-positive rate, a commercial interest, an
unverifiable revenue claim — the caveat is printed with the citation.

Named sources include the practitioners the research ranked: Emil Kowalski on motion (and the
shipped Sonner and Vaul CSS where you can check he follows his own numbers), Josh W. Comeau on
transitions, shadows and reduced motion, Gesso Build's deterministic anti-slop detectors, Adrian
Krebs's empirical scoring of 1,590 landing pages, Nutlope's Hallmark catalogue, Rauno Freiberg's
90/10 novelty rule, CodeStitch's audited local-business practice, the GOV.UK type scale, and
WCAG 2.2 AA. It also credits the Impeccable design plugin (v4.3.1) where a rule overlaps
with its craft floor, and deliberately does not restate what that plugin's editor hook already
enforces while you type.

One thing the rulebook refuses to let onto a page: the claim that *"94% of first impressions are
design-related — Stanford"*. It is a documented misattribution, it is the first statistic
anyone reaches for, and there is a rule that catches it. The real figures are Lindgaard et al.
2006 on 50-millisecond first impressions, or the Stanford Web Credibility Project's actual 46.1%.

---

## Learning it

[**LEARNING-PATH.md**](LEARNING-PATH.md) — ten stops, from "I have never made a website" to
"I understand why that gradient was wrong."

It is generated from the rulebook, not written alongside it. Every stop names the rule ids that
carry its reasoning, and `npm run docs:check` fails if a stop names a rule that no longer
exists. A course maintained separately from the linter drifts away from it within a month, and
then it teaches rules the tool does not run — which teaches you to distrust the tool.

The order is deliberately **not** the rulebook's order. `review_site` sorts by how fast a
visitor notices a fault, which is right for a critique and wrong for learning. The path sorts by
what you need first: make it work, then make it not look broken, then make it not look generic,
then make it honest, then understand why the escape routes keep closing.

Ask Codex for it in words — *"walk me through the learning path"* — or one stop at a time.

---

## Working on the kit itself

```bash
git clone https://github.com/Javendean/codex-site-kit
cd codex-site-kit
npm install

npm test              # the full suite
npm run handshake     # speak MCP to the server over stdio and print what it says
npm run docs          # regenerate LEARNING-PATH.md and RULES.md from the rulebook
npm run docs:check    # fail if they are stale
npm run doctor        # what this machine is missing
```

There is deliberately **no build step and no `prepack` script**, and a test enforces it: adding
one would make `npx -y github:...` do work at install time, which is the difference between an
install that works on a beginner's machine and one that does not.

## Licence

MIT.
