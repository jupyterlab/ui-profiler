import {
  ILayoutRestorer,
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { MainAreaWidget, WidgetTracker } from '@jupyterlab/apputils';
import { PageConfig } from '@jupyterlab/coreutils';
import { IDocumentManager } from '@jupyterlab/docmanager';
import { FileBrowserModel } from '@jupyterlab/filebrowser';
import { ILauncher } from '@jupyterlab/launcher';
import { nullTranslator } from '@jupyterlab/translation';
import { offlineBoltIcon } from '@jupyterlab/ui-components';
import type { DockPanel } from '@lumino/widgets';
import { UIProfiler } from './ui';
import {
  styleSheetsBenchmark,
  styleRuleBenchmark,
  styleRuleGroupBenchmark,
  styleRuleUsageBenchmark
} from './styleBenchmarks';
import { selfProfileBenchmark } from './jsBenchmarks';
import {
  MenuOpenScenario,
  MenuSwitchScenario,
  SwitchTabScenario,
  SwitchTabFocusScenario,
  SidebarOpenScenario,
  CompleterScenario,
  ScrollScenario,
  DebuggerScenario
} from './scenarios';
import {
  executionTimeBenchmark,
  IBenchmark,
  ITimingOutcome,
  IProfilingOutcome
} from './benchmark';
import { IJupyterState } from './utils';

namespace CommandIDs {
  // export const findUnusedStyles = 'ui-profiler:find-unused-styles';
  export const openProfiler = 'ui-profiler:open';
}

/**
 * Initialization data for the @jupyterlab/ui-profiler extension.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: '@jupyterlab/ui-profiler:plugin',
  autoStart: true,
  requires: [IDocumentManager],
  optional: [ILauncher, ILayoutRestorer],
  activate: (
    app: JupyterFrontEnd,
    docManager: IDocumentManager,
    launcher: ILauncher | null,
    restorer: ILayoutRestorer | null
  ) => {
    const fileBrowserModel = new FileBrowserModel({
      manager: docManager
    });
    const options = {
      benchmarks: [
        executionTimeBenchmark,
        styleSheetsBenchmark,
        styleRuleBenchmark,
        styleRuleGroupBenchmark,
        styleRuleUsageBenchmark,
        selfProfileBenchmark
      ] as (IBenchmark<ITimingOutcome<any>> | IBenchmark<IProfilingOutcome>)[],
      scenarios: [
        new MenuOpenScenario(app),
        new MenuSwitchScenario(app),
        new SwitchTabScenario(app),
        new SwitchTabFocusScenario(app),
        new SidebarOpenScenario(app),
        new CompleterScenario(app),
        new ScrollScenario(app),
        new DebuggerScenario(app)
      ],
      translator: nullTranslator,
      upload: (file: File) => {
        // https://github.com/jupyterlab/jupyterlab/issues/11416
        return fileBrowserModel.upload(file);
      },
      getJupyterState: () => {
        const state: IJupyterState = {
          client: app.name,
          version: app.version,
          devMode:
            (PageConfig.getOption('devMode') || '').toLowerCase() === 'true',
          mode: PageConfig.getOption('mode') as DockPanel.Mode
        };
        return state;
      },
      resultLocation: '/ui-profiler-results/'
    };
    let lastWidget: MainAreaWidget<UIProfiler> | null = null;

    const createWidget = () => {
      const content = new UIProfiler(options);
      const widget = new MainAreaWidget({ content });
      widget.id = 'ui-profiler-centre';
      widget.title.label = 'UI Profiler';
      widget.title.closable = true;
      widget.title.icon = offlineBoltIcon;
      return widget;
    };

    const tracker = new WidgetTracker<MainAreaWidget<UIProfiler>>({
      namespace: 'ui-profiler'
    });

    app.commands.addCommand(CommandIDs.openProfiler, {
      execute: async () => {
        let widget: MainAreaWidget<UIProfiler>;
        if (!lastWidget || lastWidget.isDisposed) {
          widget = createWidget();
        } else {
          widget = lastWidget;
        }
        lastWidget = widget;

        if (!widget.isAttached) {
          // Attach the widget to the main work area if it's not there
          app.shell.add(widget, 'main');
        }
        // Activate the widget
        app.shell.activateById(widget.id);
        tracker.add(widget);
      },
      label: 'UI Profiler',
      icon: offlineBoltIcon,
      caption: 'Open JupyterLab UI Profiler'
    });

    // TODO this does work and allows to avoid defining a custom tracker
    // but there is a bug in restoration - the icon class on tab bar does
    // not get properly restored.
    // if (restorer) {
    // restorer.add(widget, 'test')
    // }

    if (restorer) {
      // Handle state restoration.
      void restorer.restore(tracker as any, {
        command: CommandIDs.openProfiler,
        name: widget => widget.title.label
      });
    }

    if (launcher) {
      launcher.add({
        command: CommandIDs.openProfiler,
        category: 'Other',
        rank: 1
      });
    }
  }
};

export default plugin;
