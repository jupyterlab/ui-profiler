# Configuration file for the Sphinx documentation builder.
#
# This file only contains a selection of the most common options. For a full
# list see the documentation:
# https://www.sphinx-doc.org/en/master/usage/configuration.html

# -- Path setup --------------------------------------------------------------

# If extensions (or modules to document with autodoc) are in another directory,
# add these directories to sys.path here. If the directory is relative to the
# documentation root, use os.path.abspath to make it absolute, like shown here.
#
import os
import shutil
import sys
import importlib.metadata
from pathlib import Path
from typing import List
sys.path.insert(0, os.path.abspath('.'))


HERE = Path(__file__).parent.resolve()


# -- Project information -----------------------------------------------------

project = 'JupyterLab UI Profiler'
copyright = '2022, Project Jupyter'
author = 'Project Jupyter'

# The full version, including alpha/beta/rc tags.
release = importlib.metadata.version("jupyterlab-ui-profiler")
# The short X.Y version.
version = ".".join(release.split(".")[:2])

# -- General configuration ---------------------------------------------------

# Add any Sphinx extension module names here, as strings. They can be
# extensions coming with Sphinx (named 'sphinx.ext.*') or your custom
# ones.
extensions = [
    "myst_nb",
    "sphinx.ext.githubpages",
    "sphinx.ext.viewcode",
    "sphinx_copybutton"
]

source_suffix = [".rst", ".md"]


# Add any paths that contain templates here, relative to this directory.
templates_path = ['_templates']

# List of patterns, relative to source directory, that match files and
# directories to ignore when looking for source files.
# This pattern also affects html_static_path and html_extra_path.
exclude_patterns = [
    ".ipynb_checkpoints/**",
    "**/.ipynb_checkpoints/**",
]


# -- Options for HTML output -------------------------------------------------

# The theme to use for HTML and HTML Help pages.  See the documentation for
# a list of builtin themes.
#
html_theme = 'pydata_sphinx_theme'

# Add any paths that contain custom static files (such as style sheets) here,
# relative to this directory. They are copied after the builtin static files,
# so a file named "default.css" will overwrite the builtin "default.css".
html_static_path = ['_static']

# Maybe we will enable it later as documentation grows
html_sidebars = {
  "**": []
}

myst_enable_extensions = [
  "html_image"
]

html_favicon = "_static/logo-icon.png"

github_url = "https://github.com"
github_repo_org = "jupyterlab"
github_repo_name = "ui-profiler"
github_repo_slug = f"{github_repo_org}/{github_repo_name}"
github_repo_url = f"{github_url}/{github_repo_slug}"

html_show_sourcelink = True

html_context = {
    "display_github": True,
    # these automatically-generated pages will create broken links
    "hide_github_pagenames": ["search", "genindex"],
    "github_user": github_repo_org,
    "github_repo": github_repo_name,
    "github_version": "main",
    "conf_py_path": "/docs/",
}

html_theme_options = {
    "use_edit_page_button": True,
    "github_url": github_repo_url
}


IMAGES_FOLDER = "images"
AUTOMATED_SCREENSHOTS_FOLDER = "ui-tests/tests"


def copy_automated_screenshots(temp_folder: Path) -> List[Path]:
    print(f"\n\n{temp_folder}\n")
    docs = HERE.parent
    root = docs.parent

    src = root / AUTOMATED_SCREENSHOTS_FOLDER

    temp_folder.mkdir(exist_ok=True)
    copied_files = []
    for img in src.rglob("*.png"):
        target = temp_folder / (img.name.replace("-linux", ""))
        shutil.copyfile(str(img), str(target))
        copied_files.append(target)
        print(target)

    return copied_files


def setup(app):
    tmp_files = copy_automated_screenshots(Path(app.srcdir) / IMAGES_FOLDER)

    def clean_code_files(app, exception):
        """Remove temporary folder."""
        for f in tmp_files:
            f.unlink()

    app.connect("build-finished", clean_code_files)
