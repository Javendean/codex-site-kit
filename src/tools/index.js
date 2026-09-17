/**
 * The tools, in the order they are used.
 *
 * review_site is first because it is the one worth knowing about. Everything
 * else exists to answer a question it raised — explain_rule reads the note
 * behind one finding, learning_path puts the whole rulebook in the order a
 * beginner needs rather than the order a critique needs.
 */

import * as reviewSite from './review_site.js';
import * as explainRule from './explain_rule.js';
import * as learningPath from './learning_path.js';
import * as initSite from './init_site.js';
import * as paletteFromSubject from './palette_from_subject.js';
import * as paletteFromImage from './palette_from_image.js';
import * as checkResponsive from './check_responsive.js';
import * as checkCopy from './check_copy.js';
import * as checkHonesty from './check_honesty.js';
import * as checkAssets from './check_assets.js';
import * as checkSingleSource from './check_single_source.js';
import * as doctor from './doctor.js';

export const tools = [
  reviewSite,
  explainRule,
  learningPath,
  initSite,
  paletteFromSubject,
  paletteFromImage,
  checkResponsive,
  checkCopy,
  checkHonesty,
  checkAssets,
  checkSingleSource,
  doctor
];

export const byName = Object.fromEntries(tools.map((t) => [t.name, t]));

export {
  reviewSite,
  explainRule,
  learningPath,
  initSite,
  paletteFromSubject,
  paletteFromImage,
  checkResponsive,
  checkCopy,
  checkHonesty,
  checkAssets,
  checkSingleSource,
  doctor
};
