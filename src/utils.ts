export function waitForElement(
  selector: string,
  attributes = false
): Promise<Element> {
  return new Promise(resolve => {
    const node = document.querySelector(selector);
    if (node) {
      return resolve(node);
    }

    const observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node instanceof HTMLElement && node.matches(selector)) {
            resolve(node);
            observer.disconnect();
          }
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: attributes
    });
  });
}

export function waitNoElement(selector: string): Promise<void> {
  return new Promise(resolve => {
    if (!document.querySelector(selector)) {
      return resolve();
    }

    const observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        for (const node of mutation.removedNodes) {
          if (node instanceof HTMLElement && node.matches(selector)) {
            resolve();
            observer.disconnect();
          }
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  });
}

export function layoutReady(): Promise<void> {
  return new Promise(resolve => {
    return requestAnimationFrame(() => {
      resolve();
    });
  });
}

export function shuffled<T = any>(array: T[]): T[] {
  return array
    .map(value => ({ value, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ value }) => value);
}

export function reportTagCounts(): Record<string, number> {
  return {
    total: document.querySelectorAll('*').length,
    div: document.querySelectorAll('div').length,
    span: document.querySelectorAll('span').length,
    svg: document.querySelectorAll('svg').length,
    li: document.querySelectorAll('li').length
  };
}
