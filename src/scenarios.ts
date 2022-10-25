import type { JupyterFrontEnd } from '@jupyterlab/application';
import type { MainAreaWidget } from '@jupyterlab/apputils';

import { JSONSchema7 } from 'json-schema';

import { waitForElement, layoutReady, waitNoElement } from './utils';
import { IScenario } from './benchmark';

import type { TabScenarioOptions, Tab } from './types/_scenario-tabs';
import type { ScenarioOptions } from './types/_scenario-base';

import scenarioOptionsSchema from './schema/scenario-base.json';
import scenarioTabOptionsSchema from './schema/scenario-tabs.json';

async function switchMainMenu(jupyterApp: JupyterFrontEnd) {
  for (const menu of ['edit', 'view', 'run', 'kernel', 'settings', 'help']) {
    await jupyterApp.commands.execute(`${menu}menu:open`);
    await waitForElement(`#jp-mainmenu-${menu}`);
    await layoutReady();
  }
}

async function openMainMenu(jupyterApp: JupyterFrontEnd) {
  await jupyterApp.commands.execute('filemenu:open');
  await waitForElement('#jp-mainmenu-file');
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
    // no-op
  }

  // TODO: add option to specify which menu to open (currently always file)
  setOptions(options: ScenarioOptions) {
    // no-op
  }

  async run() {
    return openMainMenu(this.jupyterApp);
  }
  cleanup = cleanupMenu;
  id = 'menuOpen';
  name = 'Open Menu';
  configSchema = scenarioOptionsSchema as JSONSchema7;
}

export class SwitchTabScenario implements IScenario {
  id = 'tabSwitch';
  name = 'Switch Tabs';
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
      this._widgets.push(widget);
    }
  }
  async cleanupSuite() {
    for (const widget of this._widgets) {
      widget.close();
      await waitNoElement(`.lm-Widget[data-id="${widget.id}"]`);
    }
  }
  async run() {
    if (!this._widgets.length) {
      throw new Error('Suite not set up');
    }
    for (const widget of this._widgets) {
      await this.jupyterApp.commands.execute('tabsmenu:activate-by-id', {
        id: widget.id
      });
      await layoutReady();
      await waitForElement(`li.lm-mod-current[data-id="${widget.id}"]`, true);
      await layoutReady();
    }
  }
  private _tabs: Tab[] = [];
  private _widgets: MainAreaWidget[] = [];
}
