# How to Cite

If you use GeoSpaX in your research, teaching, software, or other work, please
cite it. Citations help others find the project, recognize the contributors,
and support the continued development of free and open-source geospatial
software.

GeoSpaX does not have its own DOI yet. Until it is archived on
[Zenodo](https://zenodo.org/), cite the repository URL as below. (The DOI
`10.5281/zenodo.20785400` belongs to the GeoLibre platform; use it only when
citing GeoLibre — see [Citing the GeoLibre platform](#citing-the-geolibre-platform).)

## Recommended citation

> Moses, J. (2026). GeoSpaX 2.0.0 — GSX domain workbenches for environmental
> and geospatial analysis [Computer software].
> <https://github.com/jm0535/GeoSpaX>

## BibTeX

```bibtex
@software{moses_geospax,
  author    = {Moses, J.},
  title     = {{GeoSpaX 2.0.0: GSX domain workbenches for environmental and geospatial analysis}},
  year      = {2026},
  url       = {https://github.com/jm0535/GeoSpaX},
  note      = {Built on GeoLibre (doi:10.5281/zenodo.20785400)}
}
```

## APA

> Moses, J. (2026). GeoSpaX 2.0.0 — GSX domain workbenches for environmental
> and geospatial analysis [Computer software].
> <https://github.com/jm0535/GeoSpaX>

## Citing the GeoLibre platform

GeoSpaX is built on [GeoLibre](https://github.com/opengeos/GeoLibre). When the
platform contributes to your work, cite it as well:

> Wu, Q. (2026). GeoLibre: A lightweight, cloud-native GIS platform for
> visualizing, exploring, and analyzing geospatial data [Computer software].
> Zenodo. <https://doi.org/10.5281/zenodo.20785400>

## Citing the GSX workbenches

Each of the twelve GSX workbenches carries a **How to cite** section with
ready-to-copy APA and BibTeX entries. If a workbench contributes to a report,
thesis or paper, cite GeoSpaX — and also cite every dataset provider (GBIF,
OBIS, iNaturalist, WoRMS, World Bank, GEBCO and others) whose layers you
mapped. See the [GSX plugin guides](user-guide/gsx-plugins/index.md).

## Citation metadata file

The repository ships a [`CITATION.cff`](https://github.com/jm0535/GeoSpaX/blob/main/CITATION.cff)
file, so you can also use GitHub's **"Cite this repository"** button (in the
sidebar of the [repository page](https://github.com/jm0535/GeoSpaX)) to copy
a ready-made APA or BibTeX entry. Reference managers such as Zotero and tools
like [`cffconvert`](https://github.com/citation-file-format/cffconvert) can read
the same file.

## Citing dependencies

GeoSpaX builds on many open-source projects. If your work relies heavily on a
particular component, please consider citing it as well. See the
[Acknowledgements](acknowledgements.md) page for the full list of projects that
make GeoSpaX possible.
