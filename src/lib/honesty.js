/**
 * Detection of invented content.
 *
 * This is the file that makes this a site kit rather than a generic linter.
 * A spell checker does not care whether a page claims four hundred happy
 * customers it does not have. These rules only care about that.
 *
 * Three severities, and the distinction is the point:
 *
 *   error  Content that cannot be true of a site with no history. A review no
 *          customer wrote. A star rating nobody gave. A press mention that did
 *          not happen. These are not style problems.
 *
 *   warn   Content that MIGHT be true and has not been shown to be. The
 *          quotation with a name under it lives here: the quote may be real,
 *          and the attribution may still be wrong. Record the source in
 *          .honesty.json and the warning goes away.
 *
 *   info   A placeholder that declares itself. An unfilled field drawn as an
 *          unfilled field is honest. It is listed so it is not forgotten, not
 *          because it is wrong.
 */

import { blocks, markdownBlocks, commentRanges, rawRanges, fenceRanges, inRanges } from './html.js';
import { lineIndex } from './files.js';

export const SEVERITY = { ERROR: 'error', WARN: 'warn', INFO: 'info' };

const NEGATION = /\b(?:no|not|never|none|without|zero|neither|nor|don't|do not|doesn't|does not|isn't|is not|aren't|are not|won't|will not|avoid|avoids|avoiding|forbid|forbidden|instead of|rather than)\b/i;

/**
 * Rhetorical "not"s that negate nothing.
 *
 * "Not just lessons, it's a transformation, trusted by 500+ students" opens
 * with a negation and then makes the claim anyway. Treating that sentence as a
 * denial let the loudest fabricated-proof claim on a page through as a note,
 * which is the worst possible direction for this check to be wrong in.
 */
const FAKE_NEGATION = /\b(?:not just|not only|more than just|no less than|nothing short of|no other)\b/i;

/** How far back a real negation can sit and still govern the match. */
const NEGATION_WINDOW = 60;

/**
 * Does the sentence around this match read as a statement that the thing is
 * NOT on the site?
 *
 * The negation has to be in the same clause and close by. A "no" forty words
 * earlier, or on the other side of a full stop, is a different sentence.
 */
function isNegated(context, upTo, matched) {
  const before = upTo === -1 ? context : context.slice(0, upTo + matched.length);
  // Only the last clause: a negation before a full stop governs a different sentence.
  const clause = before.split(/[.!?;]\s/).pop();
  const window = clause.slice(Math.max(0, clause.length - matched.length - NEGATION_WINDOW));
  if (!NEGATION.test(window)) return false;
  // Strip the rhetorical forms and see whether a real negation survives.
  return NEGATION.test(window.replace(FAKE_NEGATION, ' '));
}

/* ------------------------------------------------------------------ *
 * Pattern rules
 * ------------------------------------------------------------------ */

const RULES = [
  {
    id: 'lorem_ipsum',
    label: 'Lorem ipsum',
    severity: SEVERITY.ERROR,
    patterns: [
      /\blorem\s+ipsum\b/gi,
      /\bdolor\s+sit\s+amet\b/gi,
      /\bconsectetur\s+adipiscing\b/gi,
      /\bsed\s+do\s+eiusmod\b/gi,
      /\bexcepteur\s+sint\b/gi,
      /\bduis\s+aute\s+irure\b/gi
    ],
    why: 'Filler Latin left in the page. A visitor reads it as a broken site.',
    fix: 'Replace it with the real sentence, or delete the block until there is one.'
  },
  {
    id: 'star_rating',
    label: 'Star rating',
    severity: SEVERITY.ERROR,
    patterns: [
      /[★☆✩✪✫✬✭✮✯]/g,
      /⭐/gu,
      /\b[1-5](?:\.\d)?\s*(?:\/|out\s+of)\s*5\b/gi,
      /\b[1-5](?:\.\d)?[\s-]star(?:s|\srating)?\b/gi,
      /\b(?:five|four)[\s-]star\b/gi,
      /\bclass\s*=\s*["'][^"']*\b(?:star|stars|rating|ratings|star-rating)\b/gi
    ],
    why: 'A rating implies people rated it. Nobody has.',
    fix: 'Delete it. Add a rating only when a real review platform is showing real scores.'
  },
  {
    id: 'testimonial',
    label: 'Testimonial',
    severity: SEVERITY.ERROR,
    patterns: [
      /\btestimonial(?:s)?\b/gi,
      /\bclass\s*=\s*["'][^"']*\b(?:testimonial|testimonials|review-card|customer-quote|quote-card)\b/gi,
      /\bwhat\s+(?:our|my|the)\s+(?:customers|clients|students|parents|players|members|users)\s+(?:are\s+)?say(?:ing)?\b/gi,
      /\b(?:customer|client|student|parent)\s+reviews?\b/gi,
      /\bhappy\s+(?:customers|clients|students|parents)\b/gi
    ],
    why: 'A testimonial is a quotation from a customer. Inventing one puts words in a real person\'s mouth.',
    fix: 'Delete the block. Add it back only with a real name, from a real person, who agreed to it.'
  },
  {
    id: 'as_seen_in',
    label: 'Press or endorsement claim',
    severity: SEVERITY.ERROR,
    patterns: [
      /\bas\s+seen\s+(?:in|on)\b/gi,
      /\bas\s+featured\s+(?:in|on|by)\b/gi,
      /\bfeatured\s+(?:in|on)\s+(?:the\s+)?[A-Z]/g,
      /\btrusted\s+by\b/gi,
      /\bendorsed\s+by\b/gi,
      /\bofficial\s+partner\s+of\b/gi,
      /\bclass\s*=\s*["'][^"']*\b(?:press-logos|media-mentions|as-seen-in|logo-wall)\b/gi
    ],
    why: 'This says a named outlet or organisation vouched for the site. That is checkable, and if it did not happen it is a false statement.',
    fix: 'Remove it unless you can link to the article or the partnership page.'
  },
  {
    id: 'social_proof_count',
    label: 'Invented customer count',
    severity: SEVERITY.ERROR,
    patterns: [
      /\b(?:over|more\s+than|join|serving|helping|taught|trained)\s+[\d][\d,.]*\s*(?:\+|k|m|million|thousand)?\s*(?:happy\s+)?(?:customers|clients|students|users|members|subscribers|families|parents|players|readers|schools|businesses|people)\b/gi,
      /\b[\d][\d,.]*\s*\+\s*(?:happy\s+)?(?:customers|clients|students|users|members|reviews|families|players)\b/gi,
      /\b(?:\d{1,3}(?:,\d{3})+|\d+k|\d+\s*million)\s+(?:happy\s+)?(?:customers|clients|students|users|members|downloads|reviews)\b/gi
    ],
    why: 'A head count is a factual claim with a number in it. If the number was not counted, it is a fabrication.',
    fix: 'Delete it, or replace it with something you can show, such as the year you started teaching.'
  },
  {
    id: 'placeholder_identity',
    label: 'Placeholder brand or contact detail',
    severity: SEVERITY.ERROR,
    patterns: [
      /\bacme(?:\s+(?:corp|corporation|inc|ltd|co))?\b/gi,
      /\b(?:contoso|fabrikam|globex|initech|umbrella\s+corp|widgets?\s+inc)\b/gi,
      /\byour\s+(?:company|business|brand|name)\s+(?:here|name)\b/gi,
      /\b(?:company|brand|business)\s+name\s+here\b/gi,
      /\b(?:john|jane)\s+doe\b/gi,
      /\b[\w.+-]+@example\.(?:com|org|net)\b/gi,
      /\bhttps?:\/\/(?:www\.)?example\.(?:com|org|net)\b/gi,
      /\b\(?555\)?[-.\s]?01\d{2}\b/g,
      /\b123\s+(?:main|any|fake)\s+(?:st|street|ave|avenue|road|rd)\b/gi
    ],
    why: 'A stand-in name or contact detail that a visitor will read as real, and may try to use.',
    fix: 'Put the real detail in, or mark the element data-placeholder so it is visibly an unfilled field.'
  },
  {
    id: 'unsupported_superlative',
    label: 'Unsupported superlative',
    severity: SEVERITY.WARN,
    patterns: [
      /\baward[\s-]winning\b/gi,
      /\b#\s?1\s+(?:rated|ranked|choice|provider|teacher|coach)\b/gi,
      /\bbest[\s-]selling\b/gi,
      /\b(?:world|industry)[\s-](?:class|leading|leader)\b/gi,
      /\bthe\s+(?:best|top)\s+(?:in|of)\s+(?:the\s+)?(?:city|country|state|world|business)\b/gi,
      /\bmarket\s+leader\b/gi
    ],
    why: 'A superlative reads as a checkable claim. If there is no award and no ranking, it is one.',
    fix: 'Name the award and link to it, or say the specific true thing instead.'
  },
  {
    id: 'open_placeholder',
    label: 'Unfinished marker left in the text',
    severity: SEVERITY.WARN,
    patterns: [
      /\b(?:TODO|TBD|FIXME|XXX|PLACEHOLDER|COMING SOON|INSERT\s+\w+\s+HERE)\b/g,
      /\[(?:your|insert|add)\s[^\]]{0,40}\]/gi
    ],
    why: 'A note to yourself that a visitor can read.',
    fix: 'Fill it in, or remove the block until you can.'
  }
];

/* ------------------------------------------------------------------ *
 * Attribution: the subtle one
 * ------------------------------------------------------------------ */

/**
 * A person-name shape. Deliberately conservative: it needs two or more
 * capitalised tokens, OR one token followed by a role or a date.
 *
 *   "Blaise Pascal"          -> yes, two tokens
 *   "Sarah M., parent"       -> yes, token + initial + role
 *   "Emanuel Lasker, 1925"   -> yes
 *   "Lessons"                -> no, one token and no role
 */
const NAME_TOKEN = String.raw`(?:[A-Z][A-Za-z'’.-]*|[A-Z]\.|van|von|der|den|de|del|della|di|du|da|la|le|bin|ibn|al)`;
const PERSON_MULTI = new RegExp(`^${NAME_TOKEN}(?:\\s+${NAME_TOKEN}){1,4}(?:\\s*,\\s*[^,]{1,48})?\\.?$`);
const PERSON_WITH_ROLE = new RegExp(`^${NAME_TOKEN}(?:\\s+${NAME_TOKEN}){0,4}\\s*,\\s*[^,]{1,48}\\.?$`);

const SAYS_VERB = /\b(?:said|says|wrote|writes|told|remarked|observed|according\s+to|—\s*as\s+\w)\b/i;

const ATTRIBUTION_CLASS = /\b(?:attrib|attribution|author|byline|cite|citation|source|quote-name|quote-author|speaker|who)\b/i;

const QUOTE_WRAPPED = /^["“‘']([\s\S]{15,})["”’']\s*[.,]?$/;

/**
 * Does this block read as an attribution line?
 * @returns {null | {confidence:'high'|'medium', reason:string, name:string}}
 */
export function attributionShape(block) {
  const t = (block.text || '').trim();
  if (!t || t.length > 90) return null;

  const classes = `${block.attrs?.class ?? ''} ${block.attrs?.id ?? ''}`;

  if (block.tag === 'cite') {
    return { confidence: 'high', reason: 'a <cite> element directly attached to a quotation', name: t };
  }

  const dash = /^[—–-]{1,2}\s*(.+)$/.exec(t);
  if (dash && /^["'“‘]?[A-Z]/.test(dash[1].trim())) {
    return {
      confidence: 'high',
      reason: 'a dash followed by a capitalised name is an attribution line',
      name: dash[1].trim()
    };
  }

  if (ATTRIBUTION_CLASS.test(classes)) {
    return {
      confidence: 'high',
      reason: `the element's class or id ("${classes.trim()}") names it as an attribution`,
      name: t
    };
  }

  if (block.tag === 'figcaption' || block.tag === 'footer') {
    return {
      confidence: 'high',
      reason: `a <${block.tag}> attached to a quotation is an attribution`,
      name: t
    };
  }

  if (SAYS_VERB.test(t)) {
    return { confidence: 'high', reason: 'the line names who said it', name: t };
  }

  if (PERSON_MULTI.test(t) || PERSON_WITH_ROLE.test(t)) {
    return {
      confidence: 'medium',
      reason:
        'a name set on its own directly under a quotation is an attribution, even with no "said" and no dash',
      name: t
    };
  }

  return null;
}

/** Is this block a quotation in its own right? */
function isQuotationBlock(block) {
  if (block.inBlockquote || block.tag === 'blockquote' || block.tag === 'q') return true;
  const t = block.text.trim();
  return QUOTE_WRAPPED.test(t);
}

/**
 * Walk the block stream looking for a quotation immediately followed by
 * something that reads as an attribution.
 */
function findAttributions(blockList, { file, index }) {
  const findings = [];

  for (let i = 0; i < blockList.length; i++) {
    const block = blockList[i];
    if (!isQuotationBlock(block)) continue;
    if (attributionShape(block) && block.inBlockquote) continue; // this IS the attribution line

    // Look at the next two blocks. An attribution sits directly under the
    // quote, whether it is inside the blockquote or immediately after it.
    for (let j = i + 1; j <= Math.min(i + 2, blockList.length - 1); j++) {
      const candidate = blockList[j];
      if (isQuotationBlock(candidate) && !candidate.inBlockquote) break;

      const shape = attributionShape(candidate);
      if (!shape) {
        // A long paragraph between the quote and a name breaks the pairing.
        if (candidate.text.length > 90) break;
        continue;
      }

      findings.push({
        rule: 'unverified_attribution',
        label: 'Quotation with an attribution',
        severity: SEVERITY.WARN,
        file,
        line: index.lineAt(candidate.start),
        column: index.columnAt(candidate.start),
        excerpt: truncate(candidate.text, 100),
        quotation: truncate(block.text, 140),
        attributed_to: truncate(shape.name, 80),
        confidence: shape.confidence,
        why: `${shape.reason.charAt(0).toUpperCase() + shape.reason.slice(1)}. The quotation above it is attributed to "${truncate(
          shape.name,
          60
        )}", and nothing here shows that attribution was checked.`,
        fix: 'Find a primary source. If you find one, add the quote and the source URL to .honesty.json and this stops being reported. If you cannot find one, print the quotation with no name under it.',
        in_comment: Boolean(candidate.inComment)
      });
      break;
    }
  }

  return findings;
}

/* ------------------------------------------------------------------ *
 * Declared placeholders
 * ------------------------------------------------------------------ */

const DATA_PLACEHOLDER_RE = /<([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)\sdata-placeholder(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;

function findDeclaredPlaceholders(text, { file, index }) {
  const findings = [];
  DATA_PLACEHOLDER_RE.lastIndex = 0;
  let m;
  while ((m = DATA_PLACEHOLDER_RE.exec(text)) !== null) {
    const name = m[3] ?? m[4] ?? m[5] ?? '';
    findings.push({
      rule: 'declared_placeholder',
      label: 'Declared placeholder',
      severity: SEVERITY.INFO,
      file,
      line: index.lineAt(m.index),
      column: index.columnAt(m.index),
      excerpt: truncate(m[0].replace(/\s+/g, ' '), 90),
      why: `An unfilled field, marked as one${name ? ` ("${name}")` : ''}. This is honest, and it is not finished.`,
      fix: 'Write the real content and remove the data-placeholder attribute.',
      in_comment: false
    });
  }
  return findings;
}

/* ------------------------------------------------------------------ *
 * Driver
 * ------------------------------------------------------------------ */

const truncate = (s, n) => {
  const t = String(s).replace(/\s+/g, ' ').trim();
  return t.length <= n ? t : t.slice(0, n - 1) + '…';
};

function sentenceAround(text, offset) {
  const from = Math.max(
    text.lastIndexOf('.', offset),
    text.lastIndexOf('!', offset),
    text.lastIndexOf('?', offset),
    text.lastIndexOf('\n', offset),
    text.lastIndexOf('>', offset)
  );
  let to = text.length;
  for (const mark of ['.', '!', '?', '\n', '<']) {
    const at = text.indexOf(mark, offset);
    if (at !== -1 && at < to) to = at;
  }
  return text.slice(Math.max(0, from + 1), Math.min(text.length, to + 1));
}

/**
 * The text a reader actually sees around a match, for judging negation.
 *
 * Slicing raw markup is not good enough. A real page had:
 *
 *   <li><span>None</span><span><b>Customers, reviews or testimonials.</b>
 *
 * which is a statement that the site has none of those. Cutting the raw source
 * at the nearest angle bracket hides the word "None" behind a tag boundary and
 * the sentence reads as a boast. The rendered block holds both spans, so the
 * negation is visible where a reader would see it.
 */
function visibleContext(text, offset, blockList) {
  for (const block of blockList) {
    if (offset >= block.start && offset <= block.end) return block.text;
  }
  return sentenceAround(text, offset);
}

/**
 * Scan one document.
 *
 * @param {{path:string, text:string, kind:'html'|'markdown'|'other'}} doc
 * @returns {Array<object>} findings
 */
export function scanDocument({ path: file, text, kind }) {
  const index = lineIndex(text);
  const findings = [];

  const skipRanges = kind === 'html' ? rawRanges(text) : kind === 'markdown' ? fenceRanges(text) : [];
  const comments = kind === 'html' ? commentRanges(text) : [];

  const blockList = kind === 'markdown' ? markdownBlocks(text) : kind === 'html' ? blocks(text) : [];

  for (const rule of RULES) {
    for (const pattern of rule.patterns) {
      const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
      let m;
      while ((m = re.exec(text)) !== null) {
        if (m[0].length === 0) {
          re.lastIndex++;
          continue;
        }
        const at = m.index;
        if (inRanges(at, skipRanges)) continue;

        const inComment = inRanges(at, comments);
        const sentence = sentenceAround(text, at);
        const context = visibleContext(text, at, blockList);
        const upTo = context.indexOf(m[0]);
        const negated = isNegated(context, upTo, m[0]);

        let severity = rule.severity;
        let why = rule.why;

        if (negated) {
          severity = SEVERITY.INFO;
          why = `${rule.why} Reported as a note only: the sentence around it reads as a statement that this does NOT appear on the site.`;
        } else if (inComment) {
          severity = severity === SEVERITY.ERROR ? SEVERITY.WARN : severity;
          why = `${rule.why} It is inside an HTML comment, so it is not visible yet — but a commented-out claim is a claim waiting to be uncommented.`;
        }

        findings.push({
          rule: rule.id,
          label: rule.label,
          severity,
          file,
          line: index.lineAt(at),
          column: index.columnAt(at),
          excerpt: truncate(sentence || m[0], 110),
          matched: truncate(m[0], 60),
          why,
          fix: rule.fix,
          in_comment: inComment
        });
      }
    }
  }

  findings.push(...findAttributions(blockList, { file, index }));

  if (kind === 'html') findings.push(...findDeclaredPlaceholders(text, { file, index }));

  // Stable ordering: by line, then by rule, so output does not churn.
  findings.sort((a, b) => a.line - b.line || a.rule.localeCompare(b.rule) || a.column - b.column);

  // One finding per rule per line. Overlapping patterns within a rule are one bug.
  const seen = new Set();
  return findings.filter((f) => {
    const key = `${f.rule}:${f.line}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Apply a .honesty.json ledger.
 *
 * An entry only suppresses a finding if it carries a source. A ledger entry
 * with no source is a promise, not a citation, so it suppresses nothing.
 */
export function applyLedger(findings, ledger) {
  const entries = (ledger?.verified ?? []).filter(
    (e) => e && typeof e.text === 'string' && typeof e.source === 'string' && e.source.trim() !== ''
  );
  if (entries.length === 0) {
    return { findings, suppressed: 0, unusable: (ledger?.verified ?? []).length };
  }

  const norm = (s) => String(s).toLowerCase().replace(/[‘’“”"']/g, '').replace(/\s+/g, ' ').trim();
  const keys = entries.map((e) => norm(e.text));

  let suppressed = 0;
  const kept = findings.filter((f) => {
    if (f.rule !== 'unverified_attribution') return true;
    const hay = norm(`${f.quotation ?? ''} ${f.attributed_to ?? ''} ${f.excerpt ?? ''}`);
    const hit = keys.some((k) => k.length > 8 && (hay.includes(k) || norm(f.quotation ?? '').includes(k)));
    if (hit) suppressed++;
    return !hit;
  });

  return {
    findings: kept,
    suppressed,
    unusable: (ledger?.verified ?? []).length - entries.length
  };
}

export { RULES };
