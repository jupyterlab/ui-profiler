export interface IRuleDescription {
  selector: string;
  source: string | null;
  ruleIndex: number;
  stylesheetIndex: number;
}

export interface IRuleData extends IRuleDescription {
  /**
   * The CSS style rule itself.
   */
  rule: CSSStyleRule;
  /**
   * Parent sheet of the rule.
   */
  sheet: CSSStyleSheet;
}

/**
 * Parsed source map, see https://sourcemaps.info/spec.html
 */
interface ISourceMap {
  version: number;
  file?: string;
  sourceRoot?: string;
  sources: string[];
  sourcesContent?: (string | null)[];
  names: string[];
  mappings: string[];
}

/**
 * Extract CSS source map from CSS text content.
 *
 * Note: if URL is embedded, fetch method will be used to retrive the JSON contents.
 */
export async function extractSourceMap(
  cssContent: string | null
): Promise<ISourceMap | null> {
  if (!cssContent) {
    return null;
  }
  const matches = cssContent.matchAll(
    new RegExp('# sourceMappingURL=(.*)\\s*\\*/', 'g')
  );
  if (!matches) {
    return null;
  }
  let url = '';
  for (const match of matches) {
    const parts = match[1].split('data:application/json;base64,');
    if (parts.length > 1) {
      return JSON.parse(atob(parts[1]));
    } else {
      url = match[1];
    }
  }
  if (url === '') {
    return null;
  }
  const response = await fetch(url);
  return response.json();
}

export async function collectRules(
  styles: HTMLStyleElement[],
  options: { skipPattern?: RegExp }
): Promise<IRuleData[]> {
  let j = 0;
  const allRules: IRuleData[] = [];
  for (const style of styles) {
    const sheet = style.sheet;
    if (!sheet) {
      continue;
    }
    const cssMap = await extractSourceMap(style.textContent);
    const sourceName = cssMap ? cssMap.sources[0] : null;
    j++;
    const rules = sheet.rules;
    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i];
      if (!(rule instanceof CSSStyleRule)) {
        continue;
      }
      if (
        options.skipPattern &&
        rule.selectorText.match(options.skipPattern) != null
      ) {
        continue;
      }
      allRules.push({
        rule: rule,
        selector: rule.selectorText,
        sheet: sheet,
        source: sourceName,
        ruleIndex: i,
        stylesheetIndex: j
      });
    }
  }
  return allRules;
}
