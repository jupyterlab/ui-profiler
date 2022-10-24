import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

/**
 * Initialization data for the @jupyterlab-benchmarks/ui-profiler extension.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: '@jupyterlab-benchmarks/ui-profiler:plugin',
  autoStart: true,
  activate: (app: JupyterFrontEnd) => {
    console.log('JupyterLab extension @jupyterlab-benchmarks/ui-profiler is activated!');
  }
};

export default plugin;
