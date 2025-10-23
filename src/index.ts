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
import { UIProfilerWidget, ConstrainedUIProfiler } from './ui';
import {
  styleSheetsBenchmark,
  styleRuleBenchmark,
  styleRuleGroupBenchmark,
  styleRuleUsageBenchmark
} from './styleBenchmarks';
import { selfProfileBenchmark } from './jsBenchmarks';
import { executionTimeBenchmark } from './benchmark';
import { IBenchmark, IUIProfiler } from './tokens';
import { UIProfiler } from './profiler';
import { plugin as scenariosPlugin } from './scenarios';

namespace CommandIDs {
  // export const findUnusedStyles = 'ui-profiler:find-unused-styles';
  export const openProfiler = 'ui-profiler:open';
}

/**
 * Initialization data for the @jupyterlab/ui-profiler extension.
 */
const plugin: JupyterFrontEndPlugin<IUIProfiler> = {
  id: '@jupyterlab/ui-profiler:plugin',
  autoStart: true,
  provides: IUIProfiler,
  activate: (app: JupyterFrontEnd) => {
    return new UIProfiler({
      app,
      benchmarks: [
        executionTimeBenchmark,
        styleSheetsBenchmark,
        styleRuleBenchmark,
        styleRuleGroupBenchmark,
        styleRuleUsageBenchmark,
        selfProfileBenchmark
      ] as IBenchmark<any>[]
    });
  }
};

const interfacePlugin: JupyterFrontEndPlugin<void> = {
  id: '@jupyterlab/ui-profiler:user-interface',
  autoStart: true,
  requires: [IUIProfiler, IDocumentManager],
  optional: [ILauncher, ILayoutRestorer],
  activate: (
    app: JupyterFrontEnd,
    profiler: IUIProfiler,
    docManager: IDocumentManager,
    launcher: ILauncher | null,
    restorer: ILayoutRestorer | null
  ) => {
    const fileBrowserModel = new FileBrowserModel({
      manager: docManager
    });
    const options = {
      translator: nullTranslator,
      profiler: profiler as unknown as ConstrainedUIProfiler,
      upload: (file: File) => {
        // https://github.com/jupyterlab/jupyterlab/issues/11416
        return fileBrowserModel.upload(file);
      },
      resultLocation:
        PageConfig.getOption('profilerDir') ?? '/ui-profiler-results/'
    };
    let lastWidget: MainAreaWidget<UIProfilerWidget> | null = null;

    const createWidget = () => {
      const content = new UIProfilerWidget(options);
      const widget = new MainAreaWidget({ content });
      widget.id = 'ui-profiler-centre';
      widget.title.label = 'UI Profiler';
      widget.title.closable = true;
      widget.title.icon = offlineBoltIcon;
      return widget;
    };

    const tracker = new WidgetTracker<MainAreaWidget<UIProfilerWidget>>({
      namespace: 'ui-profiler'
    });

    app.commands.addCommand(CommandIDs.openProfiler, {
      execute: async () => {
        let widget: MainAreaWidget<UIProfilerWidget>;
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

export * from './tokens';
export * from './types';

export default [plugin, scenariosPlugin, interfacePlugin];
