import type { JupyterFrontEnd } from '@jupyterlab/application';
import type { MainAreaWidget } from '@jupyterlab/apputils';
import { waitForElement, layoutReady, waitNoElement } from './utils';
import { IScenario } from './benchmark';

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
  async setup() {
    return openMainMenu(this.jupyterApp);
  }
  async run() {
    return switchMainMenu(this.jupyterApp);
  }
  cleanup = cleanupMenu;
  name = 'menuSwitch';
}

export class MenuOpenScenario implements IScenario {
  constructor(protected jupyterApp: JupyterFrontEnd) {
    // no-op
  }
  async run() {
    return openMainMenu(this.jupyterApp);
  }
  cleanup = cleanupMenu;
  name = 'menuOpen';
}

// TODO: add "options: ISchema" to IScenario and use rjsf, same for benchmark options
interface ITab {
  path?: string;
  type: 'file' | 'launcher';
}

export class SwitchTabScenario implements IScenario {
  constructor(protected jupyterApp: JupyterFrontEnd, tabs: ITab[]) {
    if (!tabs.length) {
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
  name = 'tabSwitch';
  private _tabs: ITab[];
  private _widgets: MainAreaWidget[];
}
