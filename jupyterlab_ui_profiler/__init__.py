import json
from pathlib import Path

from ._version import __version__


HERE = Path(__file__).parent.resolve()


with (HERE / "labextension" / "package.json").open() as fid:
    data = json.load(fid)


def _jupyter_labextension_paths():
    return [{
        "src": "labextension",
        "dest": data["name"]
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
    server_app.log.info("Registered {name} server extension".format(**data))


# For backward compatibility with notebook server - useful for Binder/JupyterHub
load_jupyter_server_extension = _load_jupyter_server_extension
