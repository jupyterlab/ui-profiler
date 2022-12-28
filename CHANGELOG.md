# Changelog

<!-- <START NEW CHANGELOG ENTRY> -->

## 0.1.5

**Please uninstall the old version before upgrading.** This is necessary because with this release the extension was moved to `@jupyterlab` namespace.

([Full Changelog](https://github.com/jupyterlab/ui-profiler/compare/v0.1.4...59e2b4d9172df6c9865e1563c0421037fb850b10))

### Enhancements made

- Allow to add code to run before invoking completer [#24](https://github.com/jupyterlab/ui-profiler/pull/24) ([@krassowski](https://github.com/krassowski))
- Add stop button [#20](https://github.com/jupyterlab/ui-profiler/pull/20) ([@krassowski](https://github.com/krassowski))
- Simplify tab scenarios options for easier setup [#19](https://github.com/jupyterlab/ui-profiler/pull/19) ([@krassowski](https://github.com/krassowski))

### Bugs fixed

- Fix for completer benchmark in CM6 (Lab 4.0) [#23](https://github.com/jupyterlab/ui-profiler/pull/23) ([@krassowski](https://github.com/krassowski))
- Do not sort reference timing array but its copy [#13](https://github.com/jupyterlab/ui-profiler/pull/13) ([@krassowski](https://github.com/krassowski))

### Maintenance and upkeep improvements

- Allow jupyter-server v2 [#22](https://github.com/jupyterlab/ui-profiler/pull/22) ([@krassowski](https://github.com/krassowski))
- Update types for tabs scenario [#21](https://github.com/jupyterlab/ui-profiler/pull/21) ([@krassowski](https://github.com/krassowski))
- Migrate to `@jupyterlab` npm namespace [#16](https://github.com/jupyterlab/ui-profiler/pull/16) ([@krassowski](https://github.com/krassowski))

### Documentation improvements

- Fix docs typos, remove style comment [#12](https://github.com/jupyterlab/ui-profiler/pull/12) ([@krassowski](https://github.com/krassowski))

### Contributors to this release

([GitHub contributors page for this release](https://github.com/jupyterlab/ui-profiler/graphs/contributors?from=2022-12-18&to=2022-12-28&type=c))

[@github-actions](https://github.com/search?q=repo%3Ajupyterlab%2Fui-profiler+involves%3Agithub-actions+updated%3A2022-12-18..2022-12-28&type=Issues) | [@krassowski](https://github.com/search?q=repo%3Ajupyterlab%2Fui-profiler+involves%3Akrassowski+updated%3A2022-12-18..2022-12-28&type=Issues)

<!-- <END NEW CHANGELOG ENTRY> -->

## 0.1.4

([Full Changelog](https://github.com/jupyterlab/ui-profiler/compare/v0.1.3...f2b4a4443b5fff366359abc6a293274829e81491))

### Enhancements made

- Implement simple time measurement benchmark [#1](https://github.com/jupyterlab/ui-profiler/pull/1) ([@krassowski](https://github.com/krassowski))

### Bugs fixed

- Fix re-opening of main area widget [#3](https://github.com/jupyterlab/ui-profiler/pull/3) ([@krassowski](https://github.com/krassowski))
- Fix form data loss on change of benchmarks/scenarios [#2](https://github.com/jupyterlab/ui-profiler/pull/2) ([@krassowski](https://github.com/krassowski))

### Maintenance and upkeep improvements

- Add missing `test:update` [#11](https://github.com/jupyterlab/ui-profiler/pull/11) ([@krassowski](https://github.com/krassowski))
- Second attempt to fix galata action [#10](https://github.com/jupyterlab/ui-profiler/pull/10) ([@krassowski](https://github.com/krassowski))
- Install jupyterlab for playwright update [#9](https://github.com/jupyterlab/ui-profiler/pull/9) ([@krassowski](https://github.com/krassowski))
- Add yarn.lock [#7](https://github.com/jupyterlab/ui-profiler/pull/7) ([@krassowski](https://github.com/krassowski))
- Add enforce-label check [#6](https://github.com/jupyterlab/ui-profiler/pull/6) ([@krassowski](https://github.com/krassowski))
- Fix jupyter-releaser CI check by moving hooks to `pyproject.toml` [#5](https://github.com/jupyterlab/ui-profiler/pull/5) ([@krassowski](https://github.com/krassowski))

### Documentation improvements

- User-facing documentation [#8](https://github.com/jupyterlab/ui-profiler/pull/8) ([@krassowski](https://github.com/krassowski))

### Contributors to this release

([GitHub contributors page for this release](https://github.com/jupyterlab/ui-profiler/graphs/contributors?from=2022-12-06&to=2022-12-18&type=c))

[@github-actions](https://github.com/search?q=repo%3Ajupyterlab%2Fui-profiler+involves%3Agithub-actions+updated%3A2022-12-06..2022-12-18&type=Issues) | [@krassowski](https://github.com/search?q=repo%3Ajupyterlab%2Fui-profiler+involves%3Akrassowski+updated%3A2022-12-06..2022-12-18&type=Issues)
