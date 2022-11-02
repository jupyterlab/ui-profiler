/**
 * Dramaturg implements a subset of Playwright-like API for native web testing.
 */
import { getKeyboardLayout } from '@lumino/keyboard';

function waitElementVisible(
  selector: string,
  within?: Element,
  visible = true
): Promise<Element> {
  return new Promise((resolve, reject) => {
    const node = (within || document).querySelector(selector);

    if (!node) {
      return reject(`No element matching ${selector} is attached`);
    }

    const conditionSatisfied = (data: { width: number; height: number }) => {
      return visible
        ? data.width !== 0 && data.height !== 0
        : data.width === 0 || data.height === 0;
    };

    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const node = entry.target;
        const matches = conditionSatisfied(entry.contentRect);
        if (matches && node instanceof HTMLElement && node.matches(selector)) {
          observer.disconnect();
          resolve(node);
        }
      }
    });

    observer.observe(node);

    if (conditionSatisfied(node.getBoundingClientRect())) {
      observer.disconnect();
      return resolve(node);
    }
  });
}

async function waitElementHidden(selector: string, within?: Element) {
  await waitElementVisible(selector, within, false);
  return null;
}

function waitForElement(selector: string, within?: Element): Promise<Element> {
  return new Promise(resolve => {
    const observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof HTMLElement)) {
            continue;
          }
          if (node.matches(selector)) {
            resolve(node);
            observer.disconnect();
          }
          const childNode = node.querySelector(selector);
          if (childNode) {
            resolve(childNode);
            observer.disconnect();
          }
        }
      }
    });

    observer.observe(within || document.documentElement, {
      childList: true,
      subtree: true,
      attributes: selector.includes('[') || selector.includes(':')
    });

    const node = document.querySelector(selector);
    if (node) {
      observer.disconnect();
      return resolve(node);
    }
  });
}

function waitNoElement(selector: string, within?: Element): Promise<null> {
  return new Promise(resolve => {
    if (!document.querySelector(selector)) {
      return resolve(null);
    }

    const observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        for (const node of mutation.removedNodes) {
          if (node instanceof HTMLElement && node.matches(selector)) {
            resolve(null);
            observer.disconnect();
          }
        }
      }
    });

    observer.observe(within || document.documentElement, {
      childList: true,
      subtree: true,
      attributes: selector.includes('[') || selector.includes(':')
    });
  });
}

export async function waitForScrollEnd(
  element: HTMLElement,
  requiredRestTime: number
): Promise<void> {
  return new Promise(resolve => {
    let lastScrollTop = element.scrollTop;
    let lastScrollLeft = element.scrollLeft;
    const intervalHandle = setInterval(() => {
      if (
        element.scrollTop === lastScrollTop &&
        element.scrollLeft === lastScrollLeft
      ) {
        clearInterval(intervalHandle);
        return resolve();
      }
      lastScrollTop = element.scrollTop;
      lastScrollLeft = element.scrollLeft;
    }, requiredRestTime);
  });
}

export function layoutReady(): Promise<void> {
  return new Promise(resolve => {
    return requestAnimationFrame(() => {
      resolve();
    });
  });
}

interface IWaitForSelectorOptions {
  state: 'attached' | 'detached' | 'visible' | 'hidden';
  timeout?: number;
  within?: Element;
}

export class ElementHandle {
  constructor(public element: Element) {
    // no-op
  }
  $(selector: string): Promise<ElementHandle | null> {
    return $(selector, this.element as HTMLElement);
  }
  click(): Promise<void> {
    return click(this.element as HTMLElement);
  }
  async focus(): Promise<void> {
    return (this.element as HTMLElement).focus();
  }
  press(key: string, options = { delay: 0 }): Promise<void> {
    return press(key, options, this.element);
  }
  type(text: string, options = { delay: 0 }): Promise<void> {
    return type(text, options, this.element);
  }
  waitForSelector(
    selector: string,
    options: IWaitForSelectorOptions
  ): Promise<ElementHandle> {
    return waitForSelector(selector, {
      ...options,
      within: this.element
    } as any);
  }
}

function waitForSelector(
  selector: string,
  options: IWaitForSelectorOptions & { state: 'visible' | 'attached' }
): Promise<ElementHandle>;

function waitForSelector(
  selector: string,
  options: IWaitForSelectorOptions & { state: 'hidden' | 'detached' }
): Promise<null>;

function waitForSelector(
  selector: string,
  options: IWaitForSelectorOptions = { state: 'visible' }
) {
  let promise: Promise<ElementHandle | null>;
  switch (options.state) {
    case 'attached':
      promise = waitForElement(selector, options.within).then(
        element => new ElementHandle(element)
      );
      break;
    case 'detached':
      promise = waitNoElement(selector, options.within);
      break;
    case 'visible':
      promise = waitElementVisible(selector, options.within).then(
        element => new ElementHandle(element)
      );
      break;
    case 'hidden':
      promise = waitElementHidden(selector, options.within);
      break;
  }
  const timeout = options.timeout || 5 * 1000;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(
        () =>
          reject(
            `Selector ${selector} not found in ${options.state} state in ${
              timeout / 1000
            }s`
          ),
        timeout
      );
    })
  ]);
}

const keyboardLayout = getKeyboardLayout();
// TODO: should lumino expose the codes?
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
const codeToKey = keyboardLayout._codes;
const keyToCode = Object.fromEntries(
  Object.entries(codeToKey).map(a => a.reverse())
);

async function press(
  key: string,
  options = { delay: 0 },
  element: Element | null = null
): Promise<void> {
  if (!element) {
    element = document.activeElement || document.body;
  }
  const keys = key.split('+');
  const modifiers = keys.filter(k => keyboardLayout.isModifierKey(k));
  const target = keys.filter(k => !keyboardLayout.isModifierKey(k))[0];
  const eventData: KeyboardEventInit = {
    keyCode: keyToCode[target],
    shiftKey: modifiers.includes('Shift'),
    ctrlKey: modifiers.includes('Ctrl'),
    metaKey: modifiers.includes('Meta'),
    key: target
  };
  element.dispatchEvent(new KeyboardEvent('keydown', eventData));
  element.dispatchEvent(new KeyboardEvent('keypress', eventData));
  if (options.delay) {
    await new Promise(resolve => setTimeout(resolve, options.delay));
  }
  element.dispatchEvent(new KeyboardEvent('keyup', eventData));
}

interface ITypeOptions {
  delay: number;
}

async function type(
  text: string,
  options: ITypeOptions = { delay: 0 },
  element: Element | null = null
): Promise<void> {
  for (const char of text) {
    await press(char, options, element);
  }
}

async function click(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  const initDict = {
    clientX: rect.x + rect.width / 2,
    clientY: rect.x + rect.height / 2
  };
  element.dispatchEvent(new MouseEvent('mousedown', initDict));
  element.dispatchEvent(new MouseEvent('mouseup', initDict));
  element.click();
}

async function $(
  selector: string,
  element?: HTMLElement
): Promise<ElementHandle | null> {
  const matched = element
    ? element.querySelector(selector)
    : document.querySelector(selector);
  if (!matched) {
    return null;
  }
  return new ElementHandle(matched);
}

export const page = {
  waitForSelector,
  press,
  $: $,
  type: async (
    selector: string,
    text: string,
    options: ITypeOptions = { delay: 0 }
  ): Promise<void> => {
    const element = await waitForSelector(selector, { state: 'visible' });
    return element.type(text, options);
  },
  click: async (selector: string): Promise<void> => {
    await waitForSelector(selector, { state: 'attached' });
    const element = await waitForSelector(selector, { state: 'visible' });
    click(element.element as HTMLElement);
  },
  focus: async (selector: string): Promise<void> => {
    const element = await waitForSelector(selector, { state: 'visible' });
    (element.element as HTMLElement).focus();
  },
  mouse: {
    wheel: async (deltaX: number, deltaY: number): Promise<void> => {
      document.dispatchEvent(
        new WheelEvent('wheel', {
          deltaX,
          deltaY
        })
      );
    }
  }
};
