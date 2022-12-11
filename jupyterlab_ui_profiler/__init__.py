from ._version import __version__


def _jupyter_labextension_paths():
    return [{
        "src": "labextension",
        "dest": "@jupyterlab-benchmarks/ui-profiler"
    }]


def _jupyter_server_extension_points():
    return [{
        "module": "jupyterlab_ui_profiler"
    }]


def _load_jupyter_server_extension(server_app):
    """
    Parameters
    ----------
    server_app: jupyterlab.labapp.LabApp
        JupyterLab application instance
    """
    if "headers" not in server_app.web_app.settings:
      server_app.web_app.settings["headers"] = {}
    server_app.web_app.settings["headers"].update({
      # Allow high-precision `performance.now()` measurements in Firefox 79+.
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
      # Allow self-profiling in Chrome.
      "Document-Policy": "js-profiling"
    })
    name = "@jupyterlab-benchmarks/ui-profiler"
    server_app.log.info(f"Registered {name} server extension")


# For backward compatibility with notebook server - useful for Binder/JupyterHub
load_jupyter_server_extension = _load_jupyter_server_extension
