/**
 * The house style for tool output.
 *
 * Every tool answers three questions in this order, because that is the order
 * someone who cannot debug needs them in:
 *
 *   1. Did it pass?           -> the verdict line
 *   2. What did you measure?  -> a table of actual numbers
 *   3. What do I do now?      -> a numbered list of next steps
 *
 * A stack trace answers none of those, so no stack trace ever reaches the
 * caller. `toolResult` and `failure` below are the only two exits.
 */

export const STATUS = {
  PASS: 'pass',
  FAIL: 'fail',
  SKIPPED: 'skipped',
  ERROR: 'error'
};

const BADGE = {
  pass: 'PASS',
  fail: 'FAIL',
  skipped: 'NOT CHECKED',
  error: 'COULD NOT RUN'
};

/** Pad/truncate for fixed-width table columns. */
function cell(value, width) {
  const s = String(value ?? '');
  if (s.length === width) return s;
  if (s.length < width) return s + ' '.repeat(width - s.length);
  return width <= 1 ? s.slice(0, width) : s.slice(0, width - 1) + '…';
}

/**
 * Render an aligned plain-text table.
 * @param {Array<{key:string,label:string,align?:'left'|'right',max?:number}>} columns
 * @param {Array<object>} rows
 */
export function table(columns, rows) {
  if (rows.length === 0) return '  (nothing to show)';
  const widths = columns.map((c) => {
    const longest = Math.max(
      c.label.length,
      ...rows.map((r) => String(r[c.key] ?? '').length)
    );
    return Math.min(longest, c.max ?? 60);
  });

  const line = (cells) =>
    '  ' +
    cells
      .map((v, i) => (columns[i].align === 'right' ? String(v).padStart(widths[i]) : cell(v, widths[i])))
      .join('  ')
      .trimEnd();

  const head = line(columns.map((c) => c.label));
  const rule = '  ' + widths.map((w) => '-'.repeat(w)).join('  ');
  const body = rows.map((r) => line(columns.map((c) => r[c.key])));
  return [head, rule, ...body].join('\n');
}

/** A `path:line` reference, rendered the way editors and terminals linkify it. */
export function where(file, line, column) {
  if (line == null) return file;
  return column == null ? `${file}:${line}` : `${file}:${line}:${column}`;
}

function renderSections(sections) {
  const out = [];
  for (const s of sections) {
    if (!s) continue;
    if (typeof s === 'string') {
      out.push(s);
      continue;
    }
    const body = s.body == null ? '' : String(s.body).trimEnd();
    if (s.title) out.push(s.title);
    if (body) out.push(body);
  }
  return out.filter(Boolean).join('\n\n');
}

/**
 * Build the MCP result for a tool that ran.
 *
 * @param {object} o
 * @param {string} o.tool
 * @param {'pass'|'fail'|'skipped'|'error'} o.status
 * @param {string} o.headline          one sentence, the verdict
 * @param {Array} [o.sections]         {title, body} blocks, in reading order
 * @param {string[]} [o.nextSteps]     imperative sentences, one action each
 * @param {object} o.data              the structured payload
 * @param {boolean} [o.isError]        true only when the TOOL failed, never when a CHECK failed
 */
export function toolResult({ tool, status, headline, sections = [], nextSteps = [], data, isError = false }) {
  const parts = [`[${BADGE[status] ?? status.toUpperCase()}] ${tool} — ${headline}`];

  const rendered = renderSections(sections);
  if (rendered) parts.push(rendered);

  if (nextSteps.length > 0) {
    parts.push(
      'What to do next:\n' + nextSteps.map((s, i) => `  ${i + 1}. ${s}`).join('\n')
    );
  }

  return {
    content: [{ type: 'text', text: parts.join('\n\n') }],
    structuredContent: { tool, status, headline, ...data },
    isError
  };
}

/**
 * Build the MCP result for a tool that could not run at all: bad input, an
 * unreadable folder, a missing dependency. The caller gets a named problem and
 * a fix, never an exception message with a file path from inside node_modules.
 */
export function failure({ tool, code, problem, why, fix, data = {} }) {
  const lines = [`[COULD NOT RUN] ${tool} — ${problem}`];
  if (why) lines.push(`Why: ${why}`);
  if (fix) {
    const steps = Array.isArray(fix) ? fix : [fix];
    lines.push('What to do next:\n' + steps.map((s, i) => `  ${i + 1}. ${s}`).join('\n'));
  }
  return {
    content: [{ type: 'text', text: lines.join('\n\n') }],
    structuredContent: {
      tool,
      status: STATUS.ERROR,
      headline: problem,
      error_code: code,
      problem,
      why: why ?? null,
      fix: Array.isArray(fix) ? fix : fix ? [fix] : [],
      ...data
    },
    isError: true
  };
}

/**
 * Wrap a tool handler so that no unexpected throw ever reaches the caller as a
 * stack trace. This is the backstop, not the plan: tools are expected to
 * return `failure(...)` for problems they anticipated.
 */
export function guard(tool, handler) {
  return async (args, extra) => {
    try {
      return await handler(args, extra);
    } catch (err) {
      const detail = err && err.message ? String(err.message).split('\n')[0] : String(err);
      return failure({
        tool,
        code: err?.code && typeof err.code === 'string' ? err.code : 'UNEXPECTED_ERROR',
        problem: 'Something went wrong inside this tool.',
        why: detail,
        fix: [
          'Check that the folder path you gave is correct and that you can open it in Finder.',
          'If the path is right, this is a bug in codex-site-kit. Report it with the line above.'
        ]
      });
    }
  };
}

/** Plural helper, so reports read like English. */
export function count(n, singular, plural = `${singular}s`) {
  return `${n} ${n === 1 ? singular : plural}`;
}
