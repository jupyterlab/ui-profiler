import {
  ILayoutRestorer,
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { MainAreaWidget, WidgetTracker } from '@jupyterlab/apputils';
import { IFileBrowserFactory } from '@jupyterlab/filebrowser';
import { ILauncher } from '@jupyterlab/launcher';
import { nullTranslator } from '@jupyterlab/translation';
import { offlineBoltIcon } from '@jupyterlab/ui-components';
import { UIProfiler } from './ui';
import {
  styleSheetsBenchmark,
  styleRuleBenchmark,
  styleRuleGroupBenchmark
} from './styleBenchmarks';
import {
  MenuOpenScenario,
  MenuSwitchScenario,
  SwitchTabScenario,
  SwitchTabFocusScenario
} from './scenarios';
import { IBenchmark } from './benchmark';

namespace CommandIDs {
  // export const findUnusedStyles = 'ui-profiler:find-unused-styles';
  export const openProfiler = 'ui-profiler:open';
}

/**
 * Initialization data for the @jupyterlab-benchmarks/ui-profiler extension.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: '@jupyterlab-benchmarks/ui-profiler:plugin',
  autoStart: true,
  requires: [IFileBrowserFactory],
  optional: [ILauncher, ILayoutRestorer],
  activate: (
    app: JupyterFrontEnd,
    factory: IFileBrowserFactory,
    launcher: ILauncher | null,
    restorer: ILayoutRestorer | null
  ) => {
    const options = {
      benchmarks: [
        styleSheetsBenchmark,
        styleRuleBenchmark,
        styleRuleGroupBenchmark
      ] as IBenchmark[],
      scenarios: [
        new MenuOpenScenario(app),
        new MenuSwitchScenario(app),
        new SwitchTabScenario(app),
        new SwitchTabFocusScenario(app)
      ],
      translator: nullTranslator,
      upload: (file: File) => {
        // this.manager = new ServiceManager();
        // this.manager.contents.uploadFile - only exists in galata...
        // TODO: this is actually an upstream issue, services should offer upload method
        // rather than each place re-implmenting it
        return factory.defaultBrowser.model.upload(file);
      }
    };
    const content = new UIProfiler(options);
    const widget = new MainAreaWidget({ content });
    widget.id = 'ui-profiler-centre';
    widget.title.label = 'UI Profiler';
    widget.title.closable = true;
    widget.title.icon = offlineBoltIcon;

    const tracker = new WidgetTracker<MainAreaWidget<UIProfiler>>({
      namespace: 'ui-profiler'
    });

    app.commands.addCommand(CommandIDs.openProfiler, {
      execute: async () => {
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
