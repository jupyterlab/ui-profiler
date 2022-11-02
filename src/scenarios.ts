import type { JupyterFrontEnd } from '@jupyterlab/application';
import type { MainAreaWidget } from '@jupyterlab/apputils';

import { JSONSchema7 } from 'json-schema';

import { page, layoutReady, ElementHandle } from './dramaturg';
import { IScenario } from './benchmark';

import type { TabScenarioOptions, Tab } from './types/_scenario-tabs';
import type { ScenarioOptions } from './types/_scenario-base';
import type { MenuOpenScenarioOptions } from './types/_scenario-menu-open';
import type { CompleterScenarioOptions } from './types/_scenario-completer';
import type { SidebarsScenarioOptions } from './types/_scenario-sidebars';

import scenarioOptionsSchema from './schema/scenario-base.json';
import scenarioMenuOpenOptionsSchema from './schema/scenario-menu-open.json';
import scenarioTabOptionsSchema from './schema/scenario-tabs.json';
import scenarioCompleterOptionsSchema from './schema/scenario-completer.json';
import scenarioSidebarsSchema from './schema/scenario-sidebars.json';

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

  setOptions(options: ScenarioOptions): void {
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

export class CompleterScenario implements IScenario {
  constructor(protected jupyterApp: JupyterFrontEnd) {
    // no-op
  }

  setOptions(options: CompleterScenarioOptions): void {
    this._options = options;
    this._useNotebook = this._options.editor === 'Notebook';
  }

  async setupSuite(): Promise<void> {
    if (!this._options) {
      throw new Error('Options not set for completer scenario.');
    }
    if (!this._options.path || this._options.path.length === 0) {
      const model = await this.jupyterApp.commands.execute(
        'docmanager:new-untitled',
        this._useNotebook
          ? { path: '', type: 'notebook' }
          : {
              path: '',
              type: 'file',
              ext: 'py'
            }
      );
      this._path = model.path;
    } else {
      this._path = this._options.path;
    }
    const widget: MainAreaWidget = await this.jupyterApp.commands.execute(
      'docmanager:open',
      {
        path: this._path,
        factory: this._useNotebook ? 'Notebook' : 'Editor'
      }
    );
    this._widget = widget;
    this.jupyterApp.shell.add(this._widget, 'main', { mode: 'split-right' });
    await activateTabWidget(this.jupyterApp, widget);
    await layoutReady();
    if (this._useNotebook) {
      // Accept default kernel in kernel selection dialog
      await page.click('.jp-Dialog-button.jp-mod-accept');
    }
    const handle = new ElementHandle(widget.node);
    await handle.waitForSelector('.jp-Editor', { state: 'attached' });
    await layoutReady();
    await handle.waitForSelector('.jp-Editor', { state: 'visible' });
    await layoutReady();
    let text: string;
    if (typeof this._options.setup?.setupText !== 'undefined') {
      text = this._options.setup.setupText;
    } else {
      const tokens = [];
      for (let i = 0; i < this._options.setup.tokenCount; i++) {
        tokens.push(
          ('t' + i).padEnd(this._options.setup.tokenSize, 'x') + ' = ' + i
        );
      }
      tokens.push('t');
      text = tokens.join('\n');
    }
    await insertText(this.jupyterApp, text);
    // first run is flaky
    try {
      await this.run();
    } catch (e) {
      // no-op
    }
    await this.cleanup();
  }

  async cleanupSuite(): Promise<void> {
    if (this._widget) {
      // TODO: reset cell/editor contents if anything was added?
      await this.jupyterApp.commands.execute('docmanager:save');
      this._widget.close();
    }
    // TODO: remove file; also the file should be in a temp dir
  }

  async run(): Promise<void> {
    if (this._useNotebook) {
      // TODO enter a specific cell, not the first cell?
      const handle = new ElementHandle(this._widget!.node);
      const editor = await handle.$('.jp-Editor textarea');
      await editor!.focus();
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
    await page.waitForSelector('.jp-Completer[style]', { state: 'attached' });
    await page.waitForSelector('.jp-Completer[style]', { state: 'visible' });
    await layoutReady();
  }

  async cleanup(): Promise<void> {
    await page.press('Escape');
    await layoutReady();
    await page.waitForSelector('.jp-Completer[style]', { state: 'hidden' });
    await layoutReady();
  }
  id = 'completer';
  name = 'Completer';
  configSchema = scenarioCompleterOptionsSchema as any as JSONSchema7;
  _widget: MainAreaWidget | null = null;
  _options: CompleterScenarioOptions | null = null;
  _path: string | null = null;
  _useNotebook = false;
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
      switch (tab.type) {
        case 'launcher':
          widget = await this.jupyterApp.commands.execute('launcher:create');
          break;
        case 'file':
          widget = await this.jupyterApp.commands.execute('docmanager:open', {
            path: tab.path
          });
          break;
        default:
          throw Error('Unknown tab type');
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
