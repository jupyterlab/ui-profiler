import type { JupyterFrontEnd } from '@jupyterlab/application';
import type { MainAreaWidget } from '@jupyterlab/apputils';

import { JSONSchema7 } from 'json-schema';

import {
  waitForElement,
  layoutReady,
  waitNoElement,
  waitElementHidden,
  waitElementVisible
} from './utils';
import { IScenario } from './benchmark';

import type { TabScenarioOptions, Tab } from './types/_scenario-tabs';
import type { ScenarioOptions } from './types/_scenario-base';
import type { MenuOpenScenarioOptions } from './types/_scenario-menu-open';

import scenarioOptionsSchema from './schema/scenario-base.json';
import scenarioMenuOpenOptionsSchema from './schema/scenario-menu-open.json';
import scenarioTabOptionsSchema from './schema/scenario-tabs.json';

async function switchMainMenu(jupyterApp: JupyterFrontEnd) {
  for (const menu of ['edit', 'view', 'run', 'kernel', 'settings', 'help']) {
    await openMainMenu(jupyterApp, menu);
  }
}

async function openMainMenu(jupyterApp: JupyterFrontEnd, menu = 'file') {
  await jupyterApp.commands.execute(`${menu}menu:open`);
  await waitForElement(`#jp-mainmenu-${menu}`);
  await layoutReady();
}

async function cleanupMenu() {
  const menu = await waitForElement('.lm-Menu');
  menu.dispatchEvent(new KeyboardEvent('keydown', { keyCode: 27 }));
  await waitNoElement('.lm-Menu');
  await layoutReady();
}

export class MenuSwitchScenario implements IScenario {
  constructor(protected jupyterApp: JupyterFrontEnd) {
    // no-op
  }

  setOptions(options: ScenarioOptions) {
    // no-op
  }

  async setup() {
    return openMainMenu(this.jupyterApp);
  }
  async run() {
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

  setOptions(options: MenuOpenScenarioOptions) {
    this._menu = options.menu;
  }

  async run() {
    return openMainMenu(this.jupyterApp, this._menu);
  }
  cleanup = cleanupMenu;
  id = 'menuOpen';
  name = 'Open Menu';
  configSchema = scenarioMenuOpenOptionsSchema as JSONSchema7;
  private _menu: string;
}

async function closeSidePanels(jupyterApp: JupyterFrontEnd) {
  for (const side of ['left', 'right']) {
    const panel = document.querySelector(`#jp-${side}-stack`);
    if (panel && !panel.classList.contains('lm-mod-hidden')) {
      await jupyterApp.commands.execute(`application:toggle-${side}-area`);
      await waitElementHidden(`#jp-${side}-stack`);
      await layoutReady();
    }
  }
}

export class SidePanelOpenScenario implements IScenario {
  constructor(protected jupyterApp: JupyterFrontEnd) {
    // no-op
  }

  setOptions(options: ScenarioOptions) {
    // no-op
  }

  async setup() {
    return closeSidePanels(this.jupyterApp);
  }
  async run() {
    // TODO make this configurable (with this list as default)
    for (const panel of [
      'table-of-contents',
      'jp-debugger-sidebar',
      'jp-property-inspector',
      'filebrowser',
      'extensionmanager.main-view',
      'jp-running-sessions'
    ]) {
      // will be possible with commands in 4.0+ https://stackoverflow.com/a/74005349/6646912
      this.jupyterApp.shell.activateById(panel);
      await waitElementVisible(`#${CSS.escape(panel)}`);
      await layoutReady();
    }
  }
  // TOOD restore initially open panel?
  //cleanup = cleanupMenu;
  id = 'sidePanelOpen';
  name = 'Open Side Panel';
  configSchema = scenarioOptionsSchema as JSONSchema7;
}

export class SwitchTabScenario implements IScenario {
  id = 'tabSwitch';
  name = 'Switch Tabs';
  split: 'first' | 'all' = 'first';
  configSchema = scenarioTabOptionsSchema as any as JSONSchema7;

  constructor(protected jupyterApp: JupyterFrontEnd) {
    // no-op
  }

  setOptions(options: TabScenarioOptions) {
    const { tabs } = options;
    if (!tabs || !tabs.length) {
      throw new Error('At least one tab specification must be provided');
    }
    this._tabs = tabs;
    this._widgets = [];
  }

  async setupSuite() {
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
      await waitForElement('#' + widget.id);
      if (
        (this.split === 'first' && this._widgets.length === 0) ||
        this.split === 'all'
      ) {
        this.jupyterApp.shell.add(widget, 'main', { mode: 'split-right' });
      }
      await this._activateWidget(widget);
      this._widgets.push(widget);
    }
  }
  async cleanupSuite() {
    for (const widget of this._widgets) {
      widget.close();
      await waitNoElement(`.lm-Widget[data-id="${widget.id}"]`);
    }
  }
  private async _activateWidget(widget: MainAreaWidget) {
    await this.jupyterApp.commands.execute('tabsmenu:activate-by-id', {
      id: widget.id
    });
    await layoutReady();
    await waitForElement(`li.lm-mod-current[data-id="${widget.id}"]`, true);
    await layoutReady();
  }
  async run() {
    if (!this._widgets.length) {
      throw new Error('Suite not set up');
    }
    for (const widget of this._widgets) {
      await this._activateWidget(widget);
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
