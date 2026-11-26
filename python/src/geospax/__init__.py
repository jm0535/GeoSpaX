"""GeoSpaX in Jupyter: the GeoSpaX GIS app as an anywidget, with a leafmap-style API.

``geospax`` is the public package name. The implementation lives in the
``geolibre`` module inherited from the GeoLibre platform (MIT), which GeoSpaX
keeps under its original name so upstream updates merge cleanly; everything
public is re-exported here, so ``import geospax`` is all users need.
"""

from geolibre import *  # noqa: F401,F403
from geolibre import __all__ as _platform_all
from geolibre import __version__ as platform_version

__version__ = "2.0.0"
__all__ = [name for name in _platform_all if name != "__version__"] + [
    "__version__",
    "platform_version",
]
