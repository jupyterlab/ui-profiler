import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import { MainAreaWidget } from '@jupyterlab/apputils';
import { ILauncher } from '@jupyterlab/launcher';
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
  SwitchTabScenario
} from './scenarios';

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
  optional: [ILauncher],
  activate: (app: JupyterFrontEnd, launcher: ILauncher | null) => {
    // Create a blank content widget inside of a MainAreaWidget
    const content = new UIProfiler({
      benchmarks: [
        styleSheetsBenchmark,
        styleRuleBenchmark,
        styleRuleGroupBenchmark
      ],
      scenarios: [
        new MenuOpenScenario(app),
        new MenuSwitchScenario(app),
        new SwitchTabScenario(app)
      ]
    });
    const widget = new MainAreaWidget({ content });
    widget.id = 'ui-profiler-centre';
    widget.title.label = 'UI Profiler';
    widget.title.closable = true;
    widget.title.icon = offlineBoltIcon;

    app.commands.addCommand(CommandIDs.openProfiler, {
      execute: async () => {
        if (!widget.isAttached) {
          // Attach the widget to the main work area if it's not there
          app.shell.add(widget, 'main');
        }
        // Activate the widget
        app.shell.activateById(widget.id);
      },
      label: 'UI Profiler',
      icon: offlineBoltIcon,
      caption: 'Open JupyterLab UI Profiler'
    });

    if (launcher) {
      launcher.add({
        command: CommandIDs.openProfiler,
        category: 'Other',
        rank: 1
      });
    }
    console.log(
      'JupyterLab extension @jupyterlab-benchmarks/ui-profiler is activated!'
    );
  }
};

export default plugin;
