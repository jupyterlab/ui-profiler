import type {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import type { MainAreaWidget } from '@jupyterlab/apputils';

import { JSONSchema7 } from 'json-schema';
import {
  page,
  layoutReady,
  ElementHandle,
  waitForScrollEnd,
  waitUntilDisappears
} from './dramaturg';
import { IScenario, IUIProfiler } from './tokens';

import type { Tab } from './types/_scenario-tabs';
import type {
  MenuOpenScenarioOptions,
  CompleterScenarioOptions,
  SidebarsScenarioOptions,
  TabScenarioOptions,
  ScrollScenarioOptions,
  DebuggerScenarioOptions
} from './types';

import scenarioOptionsSchema from './schema/scenario-base.json';
import scenarioMenuOpenOptionsSchema from './schema/scenario-menu-open.json';
import scenarioTabOptionsSchema from './schema/scenario-tabs.json';
import scenarioCompleterOptionsSchema from './schema/scenario-completer.json';
import scenarioDebuggerOptionsSchema from './schema/scenario-debugger.json';
import scenarioSidebarsSchema from './schema/scenario-sidebars.json';
import scenarioScrollSchema from './schema/scenario-scroll.json';

async function switchMainMenu(jupyterApp: JupyterFrontEnd) {
  for (const menu of ['edit', 'view', 'run', 'kernel', 'settings', 'help']) {
    await openMainMenu(jupyterApp, menu);
  }
}

async function openMainMenu(jupyterApp: JupyterFrontEnd, menu = 'file') {
  await jupyterApp.commands.execute(`${menu}menu:open`);
  await page.waitForSelector(`#jp-mainmenu-${menu}`, { state: 'attached' });
  await layoutReady();
}

async function cleanupMenu(): Promise<void> {
  // ensure menu is open
  await page.waitForSelector('.lm-Menu', { state: 'attached' });
  await page.press('Escape');
  await page.waitForSelector('.lm-Menu', { state: 'detached' });
  await layoutReady();
}

export class MenuSwitchScenario implements IScenario {
  constructor(protected jupyterApp: JupyterFrontEnd) {
    // no-op
  }

  async setup(): Promise<void> {
    return openMainMenu(this.jupyterApp);
  }
  async run(): Promise<void> {
    return switchMainMenu(this.jupyterApp);
  }
  cleanup = cleanupMenu;
  id = 'menuSwitch';
  name = 'Switch Menu';
  configSchema = scenarioOptionsSchema as JSONSchema7;
}

export class MenuOpenScenario implements IScenario {
  constructor(protected jupyterApp: JupyterFrontEnd) {
    this._menu = 'file';
  }

  setOptions(options: MenuOpenScenarioOptions): void {
    this._menu = options.menu;
  }

  async run(): Promise<void> {
    return openMainMenu(this.jupyterApp, this._menu);
  }
  cleanup = cleanupMenu;
  id = 'menuOpen';
  name = 'Open Menu';
  configSchema = scenarioMenuOpenOptionsSchema as JSONSchema7;
  private _menu: string;
}

async function closeSidebars(jupyterApp: JupyterFrontEnd): Promise<void> {
  for (const side of ['left', 'right']) {
    const panel = document.querySelector(`#jp-${side}-stack`);
    if (panel && !panel.classList.contains('lm-mod-hidden')) {
      await jupyterApp.commands.execute(`application:toggle-${side}-area`);
      await page.waitForSelector(`#jp-${side}-stack`, { state: 'hidden' });
      await layoutReady();
    }
  }
}

export class SidebarOpenScenario implements IScenario {
  constructor(protected jupyterApp: JupyterFrontEnd) {
    // no-op
  }

  setOptions(options: SidebarsScenarioOptions): void {
    this._sidebars = options.sidebars;
  }

  async setup(): Promise<void> {
    return closeSidebars(this.jupyterApp);
  }
  async run(): Promise<void> {
    // TODO make this configurable (with this list as default)
    for (const sidebar of this._sidebars) {
      // will be possible with commands in 4.0+ https://stackoverflow.com/a/74005349/6646912
      this.jupyterApp.shell.activateById(sidebar);
      await page.waitForSelector(`#${CSS.escape(sidebar)}`, {
        state: 'visible'
      });
      await layoutReady();
    }
  }
  // TOOD restore initially open panel in cleanup?
  id = 'sidebarOpen';
  name = 'Open Sidebar';
  configSchema = scenarioSidebarsSchema as any as JSONSchema7;
  private _sidebars: string[] = ['filebrowser'];
}

export function insertText(
  jupyterApp: JupyterFrontEnd,
  text: string
): Promise<void> {
  return jupyterApp.commands.execute('apputils:run-first-enabled', {
    commands: [
      'notebook:replace-selection',
      'console:replace-selection',
      'fileeditor:replace-selection'
    ],
    args: {
      text: text
    }
  });
}

interface IExtendedDebuggerScenarioOptions extends DebuggerScenarioOptions {
  editor: 'Notebook';
  path: null;
}

class SingleEditorScenario<
  T extends
    | CompleterScenarioOptions
    | ScrollScenarioOptions
    | IExtendedDebuggerScenarioOptions
> {
  constructor(protected jupyterApp: JupyterFrontEnd) {
    // no-op
  }

  setOptions(options: T): void {
    this.options = options;
    this.useNotebook = this.options.editor === 'Notebook';
  }

  async setupSuite(): Promise<void> {
    if (!this.options) {
      throw new Error('Options not set for scenario.');
    }
    if (!this.options.path || this.options.path.length === 0) {
      const model = await this.jupyterApp.commands.execute(
        'docmanager:new-untitled',
        this.useNotebook
          ? { path: '', type: 'notebook' }
          : {
              path: '',
              type: 'file',
              ext: 'py'
            }
      );
      this.path = model.path;
    } else {
      this.path = this.options.path;
    }
    const widget: MainAreaWidget = await this.jupyterApp.commands.execute(
      'docmanager:open',
      {
        path: this.path,
        factory: this.useNotebook ? 'Notebook' : 'Editor'
      }
    );
    this.widget = widget;
    this.jupyterApp.shell.add(this.widget, 'main', {
      mode: this.options?.widgetPosition || 'split-right'
    });
    await activateTabWidget(this.jupyterApp, widget);
    await layoutReady();
    if (this.useNotebook) {
      // Accept default kernel in kernel selection dialog
      await page.click('.jp-Dialog-button.jp-mod-accept');
    }
    const handle = new ElementHandle(this.widget.node);
    await handle.waitForSelector('.jp-Editor', { state: 'attached' });
    await layoutReady();
    await handle.waitForSelector('.jp-Editor', { state: 'visible' });
    await layoutReady();
    this.editor = this.useNotebook
      ? this.widget!.node.querySelector('.jp-Notebook')!
      : this.widget!.node.querySelector('.jp-FileEditorCodeWrapper')!;
  }

  async cleanupSuite(): Promise<void> {
    if (this.widget) {
      // TODO: reset cell/editor contents if anything was added?
      await this.jupyterApp.commands.execute('docmanager:save');
      this.widget.close();
    }
    // TODO: remove file; also the file should be in a temp dir
  }

  protected editor: HTMLElement | null = null;
  protected path: string | null = null;
  protected options: T | null = null;
  protected useNotebook = true;
  protected widget: MainAreaWidget | null = null;
}

export class CompleterScenario
  extends SingleEditorScenario<CompleterScenarioOptions>
  implements IScenario
{
  id = 'completer';
  name = 'Completer';
  configSchema = scenarioCompleterOptionsSchema as any as JSONSchema7;

  async setupSuite(): Promise<void> {
    await super.setupSuite();
    if (!this.widget || !this.options) {
      throw new Error('Parent setup failure');
    }
    let text: string;
    if (typeof this.options.setup?.setupText !== 'undefined') {
      text = this.options.setup.setupText;
    } else {
      const tokens = [];
      for (let i = 0; i < this.options.setup.tokenCount; i++) {
        tokens.push(
          ('t' + i).padEnd(this.options.setup.tokenSize, 'x') + ' = ' + i
        );
      }
      tokens.push('t');
      text = tokens.join('\n');
    }
    if (this.useNotebook && this.options.setup.setupCell) {
      await insertText(this.jupyterApp, this.options.setup.setupCell);
      await waitForKernelStatus(this.widget.node, 'idle');
      await this.jupyterApp.commands.execute(
        'notebook:run-cell-and-insert-below'
      );
      await insertText(this.jupyterApp, text);
      await this.jupyterApp.commands.execute('notebook:enter-edit-mode');
    } else {
      await insertText(this.jupyterApp, text);
    }

    if (!this.useNotebook) {
      // Scroll down a little bit to avoid out of view bug
      // `.CodeMirror-scroll` is CM5, `.cm-scroller` is CM6
      const scrollArea =
        this.editor!.querySelector('.CodeMirror-scroll')! ||
        this.editor!.querySelector('.cm-scroller')!;
      scrollArea.scrollBy({
        top: 20 * this.options.setup.tokenCount,
        left: 0,
        behavior: 'smooth'
      });
    }

    // first run is flaky
    try {
      await this.run();
    } catch (e) {
      // no-op
    }
    await this.cleanup();
  }

  async run(): Promise<void> {
    if (this.useNotebook) {
      // TODO enter a specific cell, not the first cell?
      const handle = new ElementHandle(this.widget!.node);
      const editorSelector = document.querySelector('.cm-content')
        ? '.cm-content'
        : 'textarea';
      const editor = this.options!.setup.setupCell
        ? await handle.$(`.jp-Cell:nth-child(2) .jp-Editor ${editorSelector}`)
        : await handle.$(`.jp-Editor ${editorSelector}`);
      if (!editor) {
        throw Error('Setup failed: cell editor could not be located');
      }
      await editor.focus();
    }
    await layoutReady();
    await page.press('Tab');
    await layoutReady();
    // Note: in JupyterLab 3.x all completers were retained in the attached state
    // (which may have had a performance benefit to some point, but later was just
    // cluttering the DOM) which makes finding the correct completer harder; we
    // need to query for a completer with programatically set styles (which are
    // things like position (top/left/width/height) which are only present in the
    // active completer
    await page.waitForSelector('.jp-Completer.jp-HoverBox[style]', {
      state: 'attached'
    });
    await page.waitForSelector('.jp-Completer.jp-HoverBox[style]', {
      state: 'visible'
    });
    await layoutReady();
  }

  async cleanup(): Promise<void> {
    await page.press('Escape');
    await layoutReady();
    await page.waitForSelector('.jp-Completer[style]', { state: 'hidden' });
    await layoutReady();
  }
}

async function ensureToolbarButtonsVisible() {
  const secondToolbarSelector = '.jp-Toolbar-responsive-popup';
  const moreCommandsButton = await page.$(
    '.jp-Toolbar-responsive-opener > button[title="More commands"]'
  );
  if (moreCommandsButton && (await moreCommandsButton.isVisible())) {
    const secondToolbar = await page.$(secondToolbarSelector);
    if (secondToolbar && (await secondToolbar.isVisible())) {
      // already visible
      return;
    }
    // make sure second toolbar is visible
    await moreCommandsButton.click();
    await page.waitForSelector(secondToolbarSelector, {
      state: 'visible'
    });
  }
}

export class DebuggerScenario
  extends SingleEditorScenario<IExtendedDebuggerScenarioOptions>
  implements IScenario
{
  id = 'debugger';
  name = 'Debugger';
  configSchema = scenarioDebuggerOptionsSchema as any as JSONSchema7;

  setOptions(options: DebuggerScenarioOptions): void {
    super.setOptions({
      ...options,
      editor: 'Notebook',
      path: null
    });
  }

  private async _goToTop() {
    if (!this.options) {
      throw new Error('Setup failure');
    }
    for (let i = 0; i < this.options.codeCells.length + 1; i++) {
      await this.jupyterApp.commands.execute('notebook:move-cursor-up');
    }
  }

  async setupSuite(): Promise<void> {
    await super.setupSuite();
    if (!this.widget || !this.options) {
      throw new Error('Parent setup failure');
    }

    for (const codeCell of this.options.codeCells) {
      await insertText(this.jupyterApp, codeCell);
      await this.jupyterApp.commands.execute('notebook:insert-cell-below');
      await layoutReady();
      await layoutReady();
      await this.jupyterApp.commands.execute('notebook:enter-edit-mode');
      await layoutReady();
      await layoutReady();
    }
    await insertText(this.jupyterApp, '%reset -f');
    await this._goToTop();

    await waitForKernelStatus(this.widget.node, 'idle');
    const handle = new ElementHandle(this.widget.node);
    await ensureToolbarButtonsVisible();
    const bugIcon = await handle.waitForSelector(
      'button[aria-disabled="false"][title="Enable Debugger"]',
      {
        state: 'attached'
      }
    );
    await bugIcon.click();
    await page.waitForSelector(`#${CSS.escape('jp-debugger-sidebar')}`, {
      state: 'visible'
    });
    await ensureToolbarButtonsVisible();
    await handle.waitForSelector(
      'button[aria-disabled="false"][title="Disable Debugger"]',
      {
        state: 'attached'
      }
    );
    await layoutReady();

    await page.waitForSelector('.jp-DebuggerVariables-body', {
      state: 'attached'
    });
    await page.waitForSelector('.jp-DebuggerVariables-body', {
      state: 'visible'
    });
  }

  async run(): Promise<void> {
    if (!this.widget || !this.options) {
      throw new Error('Setup failure');
    }

    for (let i = 0; i < this.options.codeCells.length; i++) {
      await this.jupyterApp.commands.execute(
        'notebook:run-cell-and-select-next'
      );
      await waitForKernelStatus(this.widget.node, 'idle');
      const expectedCount = this.options.expectedNumberOfVariables[i];
      if (typeof expectedCount !== 'undefined') {
        await page.waitForSelector(
          `.jp-DebuggerVariables-body li:nth-child(${expectedCount + 2})`,
          {
            state: 'attached'
          }
        );
      }
      await layoutReady();
    }
  }

  async cleanup(): Promise<void> {
    if (!this.widget || !this.options) {
      throw new Error('Setup failure');
    }
    // execute `%reset -f` cell
    await layoutReady();
    const minExpected = Math.min(...this.options.expectedNumberOfVariables);
    await this.jupyterApp.commands.execute('notebook:run-cell-and-select-next');
    // first two are "special variables" and "function variables"
    await waitForKernelStatus(this.widget.node, 'idle');
    await waitUntilDisappears(
      `.jp-DebuggerVariables-body li:nth-child(${minExpected})`
    );
    await this._goToTop();
    await layoutReady();
  }
}

async function waitForKernelStatus(notebookPanel: HTMLElement, status: string) {
  await new ElementHandle(notebookPanel).waitForSelector(
    `.jp-Notebook-ExecutionIndicator[data-status="${status}"]`,
    { state: 'attached' }
  );
}

async function activateTabWidget(
  jupyterApp: JupyterFrontEnd,
  widget: MainAreaWidget
) {
  await jupyterApp.commands.execute('tabsmenu:activate-by-id', {
    id: widget.id
  });
  await layoutReady();
  await page.waitForSelector(`li.lm-mod-current[data-id="${widget.id}"]`, {
    state: 'attached'
  });
  await layoutReady();
}

export class ScrollScenario
  extends SingleEditorScenario<ScrollScenarioOptions>
  implements IScenario
{
  id = 'scroll';
  name = 'Scroll';
  configSchema = scenarioScrollSchema as any as JSONSchema7;

  async setupSuite(): Promise<void> {
    await super.setupSuite();
    if (!this.widget || !this.options) {
      throw new Error('Parent setup failure');
    }
    const showEveryN = this.options.cells < 100 ? 20 : 50;
    for (let i = 0; i < this.options.cells; i++) {
      if (this.useNotebook) {
        await this.jupyterApp.commands.execute('notebook:insert-cell-below');
      }
      if (this.options.editorContent) {
        await insertText(
          this.jupyterApp,
          this.useNotebook
            ? this.options.editorContent
            : this.options.editorContent + '\n'
        );
      }
      // just to show that the setup is progressing
      if (i < 5 || i % showEveryN === 0) {
        await layoutReady();
      }
    }
    this.editor!.scrollTop = 0;
    await layoutReady();
  }

  async run(): Promise<void> {
    if (!this.widget || !this.options) {
      throw new Error('Scrol scenario setup failure');
    }
    if (this.options.cellByCell && this.useNotebook) {
      for (let i = 0; i < this.options.cells; i++) {
        await this.jupyterApp.commands.execute('notebook:move-cursor-down');
        await layoutReady();
      }
      await layoutReady();
    } else {
      this.editor!.scrollBy({
        top: this.options.scrollTop,
        left: 0,
        behavior: this.options.scrollBehavior
      });
      await waitForScrollEnd(this.editor!, 50);
      await layoutReady();
    }
  }

  async cleanup(): Promise<void> {
    if (!this.widget || !this.options) {
      throw new Error('Scrol scenario setup failure');
    }
    if (this.options.cellByCell && this.useNotebook) {
      for (let i = 0; i < this.options.cells; i++) {
        await this.jupyterApp.commands.execute('notebook:move-cursor-up');
      }
      await layoutReady();
    } else {
      this.editor!.scrollTop = 0;
      await layoutReady();
    }
  }
}

export class SwitchTabScenario implements IScenario {
  id = 'tabSwitch';
  name = 'Switch Tabs';
  split: 'first' | 'all' = 'first';
  configSchema = scenarioTabOptionsSchema as any as JSONSchema7;

  constructor(protected jupyterApp: JupyterFrontEnd) {
    // no-op
  }

  setOptions(options: TabScenarioOptions): void {
    const { tabs } = options;
    if (!tabs || !tabs.length) {
      throw new Error('At least one tab specification must be provided');
    }
    this._tabs = tabs;
    this._widgets = [];
  }

  async setupSuite(): Promise<void> {
    this._widgets = [];
    for (const tab of this._tabs) {
      let widget: MainAreaWidget;
      if (tab.path) {
        widget = await this.jupyterApp.commands.execute('docmanager:open', {
          path: tab.path
        });
      } else {
        widget = await this.jupyterApp.commands.execute('launcher:create');
      }
      await page.waitForSelector('#' + widget.id, { state: 'attached' });
      if (
        (this.split === 'first' && this._widgets.length === 0) ||
        this.split === 'all'
      ) {
        this.jupyterApp.shell.add(widget, 'main', { mode: 'split-right' });
      }
      await activateTabWidget(this.jupyterApp, widget);
      this._widgets.push(widget);
    }
  }
  async cleanupSuite(): Promise<void> {
    for (const widget of this._widgets) {
      widget.close();
      await page.waitForSelector(`.lm-Widget[data-id="${widget.id}"]`, {
        state: 'detached'
      });
    }
  }
  async run(): Promise<void> {
    if (!this._widgets.length) {
      throw new Error('Suite not set up');
    }
    for (const widget of this._widgets) {
      await activateTabWidget(this.jupyterApp, widget);
    }
  }
  private _tabs: Tab[] = [];
  private _widgets: MainAreaWidget[] = [];
}

export class SwitchTabFocusScenario extends SwitchTabScenario {
  id = 'tabSwitchFocus';
  name = 'Switch Tab Focus';
  split: 'first' | 'all' = 'all';
}

export const plugin: JupyterFrontEndPlugin<void> = {
  id: '@jupyterlab/ui-profiler:default-scenarios',
  autoStart: true,
  requires: [IUIProfiler],
  activate: (app: JupyterFrontEnd, profiler: IUIProfiler) => {
    [
      new MenuOpenScenario(app),
      new MenuSwitchScenario(app),
      new SwitchTabScenario(app),
      new SwitchTabFocusScenario(app),
      new SidebarOpenScenario(app),
      new CompleterScenario(app),
      new ScrollScenario(app),
      new DebuggerScenario(app)
    ].map(scenario => profiler.addScenario(scenario));
  }
};
