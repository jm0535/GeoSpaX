// Shared How-to-Cite tool: every GSX workbench renders the same citation
// block so users can credit the software, the platform it builds on, and the
// data providers whose layers they mapped. Pure DOM (no framework) to match
// the other shared tools.

import { el, type PanelShell } from "./ui";

export interface CitationOptions {
  /** Panel label shown in the citation sentence, e.g. "GSX Conservation". */
  pluginLabel: string;
  /** Plugin version recorded in the citation line. */
  version?: string;
}

export const GSX_PLUGIN_VERSION = "2.0.0";
export const GSX_REPOSITORY_URL = "https://github.com/jm0535/GeoSpaX";
export const GSX_PLATFORM_URL = "https://github.com/opengeos/GeoLibre";

export const GSX_CITATION_TEXT = `GeoSpaX (2026). GeoSpaX ${GSX_PLUGIN_VERSION} — GSX domain workbenches for conservation and environmental GIS [Computer software]. ${GSX_REPOSITORY_URL}. Built on GeoLibre (Wu, Q., ${GSX_PLATFORM_URL}); cite both when the platform is used.`;

export const GSX_CITATION_BIBTEX = `@software{geospax_gsx_workbenches,
  author = {{GeoSpaX contributors}},
  title = {GeoSpaX ${GSX_PLUGIN_VERSION}: GSX domain workbenches for conservation and environmental GIS},
  year = {2026},
  url = {${GSX_REPOSITORY_URL}},
  note = {Built on GeoLibre (https://github.com/opengeos/GeoLibre); cite both when the platform is used.},
  doi = {10.5281/zenodo.20785400}
}`;

function copyText(text: string, button: HTMLButtonElement): void {
  const done = () => {
    button.textContent = "Copied!";
    window.setTimeout(() => {
      button.textContent = "Copy";
    }, 1600);
  };
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(done, () => undefined);
  } else {
    done();
  }
}

export function mountCitationTool(
  shell: PanelShell,
  parent: HTMLElement,
  options: CitationOptions,
): void {
  const root = el("div", "gsp-citation");
  const pluginLine = el(
    "p",
    "gsp-citation__line",
    `You are using ${options.pluginLabel}${
      options.version ? ` v${options.version}` : ""
    }. If it contributes to a report, thesis or paper, cite it as follows — and also cite the GeoLibre platform and every dataset provider (GBIF, OBIS, iNaturalist, WoRMS, World Bank, GEBCO and others) whose layers you mapped.`,
  );

  const apaBox = el("div", "gsp-citation__box");
  const apaLabel = el("div", "gsp-citation__label", "APA");
  const apaText = el("pre", "gsp-citation__text", GSX_CITATION_TEXT);
  const apaCopy = el("button", "gsp-citation__copy", "Copy");
  apaCopy.type = "button";
  apaCopy.addEventListener("click", () => copyText(GSX_CITATION_TEXT, apaCopy));
  apaBox.append(apaLabel, apaText, apaCopy);

  const bibtexBox = el("div", "gsp-citation__box");
  const bibtexLabel = el("div", "gsp-citation__label", "BibTeX");
  const bibtexText = el("pre", "gsp-citation__text", GSX_CITATION_BIBTEX);
  const bibtexCopy = el("button", "gsp-citation__copy", "Copy");
  bibtexCopy.type = "button";
  bibtexCopy.addEventListener("click", () => copyText(GSX_CITATION_BIBTEX, bibtexCopy));
  bibtexBox.append(bibtexLabel, bibtexText, bibtexCopy);

  const links = el("p", "gsp-citation__links");
  const repo = el("a", "gsp-citation__link", "GeoSpaX repository");
  repo.href = GSX_REPOSITORY_URL;
  repo.target = "_blank";
  repo.rel = "noreferrer";
  const platform = el("a", "gsp-citation__link", "GeoLibre platform");
  platform.href = GSX_PLATFORM_URL;
  platform.target = "_blank";
  platform.rel = "noreferrer";
  links.append(repo, " · ", platform);

  root.append(pluginLine, apaBox, bibtexBox, links);
  parent.appendChild(root);
}
