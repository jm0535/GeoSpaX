// Covariate preparation for SDM: grid sizing, cell lookup, sampling, and the
// panel tool end to end (occurrences + rasters → covariate layers → SDM with
// spatial CV) on a linkedom DOM with a fake raster reader.

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { Feature, FeatureCollection, Point } from "geojson";
import { parseHTML } from "linkedom";
import type {
  GeoLibreAppAPI,
  GeoLibreRasterWindowOptions,
} from "../packages/plugins/src/types";
import {
  covariateGridFor,
  gridCellIndex,
  pointInMask,
  sampleCovariates,
} from "../packages/geospax-analysis/src/index";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { writeArrayBuffer } from "geotiff";
import {
  chelsaUrl,
  mountCovariateTool,
  pixelWindowFor,
  readRemoteGrid,
  suggestFieldName,
  uncoveredGridCorners,
  undeclaredIntegerNodata,
} from "../packages/geospax-plugins/src/shared/covariate-tools";
import { createPanelShell } from "../packages/geospax-plugins/src/shared/ui";
import { mountSdmTool } from "../packages/geospax-plugins/src/shared/vector-tools";

const pt = (
  lon: number,
  lat: number,
  properties: Record<string, unknown> = {}
): Feature<Point> => ({
  type: "Feature",
  geometry: { type: "Point", coordinates: [lon, lat] },
  properties,
});

describe("covariateGridFor", () => {
  it("buffers the extent and snaps to whole cells", () => {
    const grid = covariateGridFor(
      [
        [141, -9],
        [143, -5],
      ],
      0.5,
      1
    )!;
    assert.deepEqual(grid.bounds, [140, -10, 144, -4]);
    assert.equal(grid.width, 8);
    assert.equal(grid.height, 12);
  });

  it("refuses grids over the host limit and bad input", () => {
    assert.equal(
      covariateGridFor(
        [
          [0, 0],
          [100, 50],
        ],
        0.01
      ),
      null
    );
    assert.equal(covariateGridFor([], 1), null);
    assert.equal(covariateGridFor([[0, 0]], 0), null);
  });
});

describe("gridCellIndex", () => {
  const grid = {
    bounds: [0, 0, 4, 2] as [number, number, number, number],
    width: 4,
    height: 2,
  };
  it("indexes row-major from the northern edge", () => {
    assert.equal(gridCellIndex(grid, 0.5, 1.5), 0); // NW
    assert.equal(gridCellIndex(grid, 3.5, 1.5), 3); // NE
    assert.equal(gridCellIndex(grid, 0.5, 0.5), 4); // SW
    assert.equal(gridCellIndex(grid, 4, 0), 7); // SE corner stays inside
    assert.equal(gridCellIndex(grid, 5, 1), -1);
  });
});

describe("sampleCovariates", () => {
  const grid = {
    bounds: [0, 0, 2, 2] as [number, number, number, number],
    width: 2,
    height: 2,
  };
  it("builds cell-centre background, drops NoData cells, annotates presences", () => {
    const result = sampleCovariates(
      grid,
      [
        { field: "a", values: [1, 2, 3, -9999], nodata: -9999 },
        { field: "b", values: [10, 20, Number.NaN, 40], nodata: null },
      ],
      [pt(0.5, 1.5, { id: "p1" }), pt(1.5, 0.5), pt(9, 9)]
    )!;
    // Cells 2 (b NaN) and 3 (a NoData) dropped.
    assert.equal(result.backgroundCells, 2);
    assert.equal(result.backgroundDropped, 2);
    assert.deepEqual(result.background[0].geometry.coordinates, [0.5, 1.5]);
    assert.deepEqual(result.background[1].properties, { cell: 1, a: 2, b: 20 });
    assert.deepEqual(result.presences[0].properties, { id: "p1", a: 1, b: 10 });
    assert.deepEqual(result.presences[1].properties, { a: null, b: 40 });
    assert.equal(result.presencesComplete, 1);
    assert.equal(result.presencesOutside, 1);
    assert.equal(result.provenance.tool, "sdm-covariates");
  });

  it("rejects mismatched rasters and duplicate fields", () => {
    assert.equal(
      sampleCovariates(grid, [{ field: "a", values: [1], nodata: null }], []),
      null
    );
    const four = [1, 2, 3, 4];
    assert.equal(
      sampleCovariates(
        grid,
        [
          { field: "a", values: four, nodata: null },
          { field: "a", values: four, nodata: null },
        ],
        []
      ),
      null
    );
  });
});

describe("helpers", () => {
  it("suggests field names and CHELSA URLs", () => {
    assert.equal(suggestFieldName("CHELSA bio12"), "bio12");
    assert.equal(suggestFieldName("wc2.1_30s_bio_01.tif"), "bio1");
    assert.equal(suggestFieldName("SRTM Elevation.tif"), "elev");
    assert.equal(suggestFieldName("2020 cover"), "v_2020_cover");
    assert.equal(
      chelsaUrl("https://example.org/chelsa/", "bio1"),
      "https://example.org/chelsa/GLOBAL/climatologies/1981-2010/bio/CHELSA_bio1_1981-2010_V.2.1.tif"
    );
  });
});

// ---- Panel end to end -------------------------------------------------------

let restoreDocument: () => void;
before(() => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "document");
  const originalCustomEvent = globalThis.CustomEvent;
  const { document, CustomEvent: DomCustomEvent } = parseHTML(
    "<html><body></body></html>"
  );
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: document,
  });
  // recordRun dispatches a CustomEvent; Node's own cannot be dispatched on linkedom nodes.
  globalThis.CustomEvent = DomCustomEvent as unknown as typeof CustomEvent;
  const proto = Object.getPrototypeOf(
    document.createElement("table")
  ) as Record<string, unknown>;
  const append = (parent: Element, tag: string) =>
    parent.appendChild(document.createElement(tag));
  proto.createCaption = function (this: Element) {
    return append(this, "caption");
  };
  proto.createTBody = function (this: Element) {
    const body = append(this, "tbody") as Element & Record<string, unknown>;
    body.insertRow = () => {
      const row = append(body, "tr") as Element & Record<string, unknown>;
      row.insertCell = () => append(row, "td");
      return row;
    };
    return body;
  };
  restoreDocument = () => {
    globalThis.CustomEvent = originalCustomEvent;
    if (original) Object.defineProperty(globalThis, "document", original);
    else Reflect.deleteProperty(globalThis, "document");
  };
});
after(() => restoreDocument());

function choose(select: HTMLSelectElement, value: string) {
  for (const option of select.querySelectorAll("option"))
    option.removeAttribute("selected");
  select
    .querySelector(`option[value="${value}"]`)
    ?.setAttribute("selected", "");
  const event = document.createEvent("Event");
  event.initEvent("change", true, false);
  select.dispatchEvent(event);
}

async function settle() {
  for (let n = 0; n < 10; n++)
    await new Promise((resolve) => setImmediate(resolve));
}

describe("covariate tool → SDM panel", () => {
  it("produces layers the SDM tool can fit and cross-validate", async () => {
    // Occurrences only in the warm north of a PNG-like box; no attributes.
    const occurrences: Feature<Point>[] = [];
    for (let lon = 141; lon <= 149; lon += 0.4)
      for (let lat = -5; lat <= -3; lat += 0.4)
        occurrences.push(pt(lon, lat, { species: "Varanus indicus" }));

    // Synthetic rasters: "temp" rises northward, "rain" varies east-west.
    const sample = (layerId: string, options: GeoLibreRasterWindowOptions) => {
      const [west, south, east, north] = options.bounds;
      const width = options.width!;
      const height = options.height!;
      const values: number[] = [];
      for (let row = 0; row < height; row++)
        for (let col = 0; col < width; col++) {
          const lon = west + ((col + 0.5) / width) * (east - west);
          const lat = north - ((row + 0.5) / height) * (north - south);
          values.push(
            layerId === "temp" ? 200 + lat * 10 : 1000 + ((lon * 37) % 50)
          );
        }
      return Promise.resolve({
        values,
        width,
        height,
        band: 1,
        nodata: null,
        overviewLevel: 0,
      });
    };

    const layers: Array<{ id: string; name: string; type: string }> = [
      { id: "occ", name: "Varanus_indicus_occurrences", type: "geojson" },
      { id: "temp", name: "CHELSA bio1", type: "cog" },
      { id: "rain", name: "CHELSA bio12", type: "cog" },
    ];
    const data = new Map<string, Feature[]>([["occ", occurrences]]);
    const app = {
      listLayers: () =>
        layers.map((layer) => ({ ...layer, visible: true, opacity: 1 })),
      getLayerFeatures: (id: string) => data.get(id) ?? [],
      readRasterWindow: sample,
      addGeoJsonLayer: (name: string, collection: FeatureCollection) => {
        const id = `out${layers.length}`;
        layers.push({ id, name, type: "geojson" });
        data.set(id, collection.features);
        return id;
      },
      onLayersChanged: () => () => undefined,
    } as unknown as GeoLibreAppAPI;

    const container = document.createElement("div");
    const shell = createPanelShell(container, app, {
      id: "t",
      title: "T",
      eyebrow: "",
      intro: "",
      accent: "#000",
    });
    const section = shell.addSection({
      id: "sdm",
      title: "SDM",
      description: "",
    });
    mountCovariateTool(shell, section, "species");
    const covariateCard = container.querySelector(
      '[data-tool="sdm-covariates"]'
    )!;
    choose(covariateCard.querySelector("select") as HTMLSelectElement, "occ");
    const fieldInputs = [
      ...covariateCard.querySelectorAll("input[aria-label^='Attribute name']"),
    ];
    assert.deepEqual(
      fieldInputs.map((input) => (input as HTMLInputElement).value),
      ["bio1", "bio12"]
    );
    // Use only the map rasters here: untick CHELSA, tick the map layers.
    for (const box of covariateCard.querySelectorAll("input[type=checkbox]")) {
      const label = box.parentElement?.textContent ?? "";
      (box as HTMLInputElement).checked = label.startsWith("CHELSA bio");
    }
    const build = [...covariateCard.querySelectorAll("button")].find((b) =>
      b.textContent?.startsWith("Build covariates")
    ) as HTMLButtonElement;
    build.click();
    await settle();
    assert.match(covariateCard.textContent ?? "", /Ready for the SDM/);
    assert.doesNotMatch(covariateCard.textContent ?? "", /eventPhase/);

    const presenceLayer = layers.find((l) => l.name.endsWith("+ covariates"))!;
    const gridLayer = layers.find((l) => l.name.endsWith("background grid"))!;
    const annotated = data.get(presenceLayer.id)!;
    assert.equal(annotated.length, occurrences.length);
    assert.ok(annotated.every((f) => typeof f.properties?.bio1 === "number"));
    assert.equal(annotated[0].properties?.species, "Varanus indicus");
    assert.ok(data.get(gridLayer.id)!.length > 100);

    // Feed straight into the SDM tool with spatial CV.
    mountSdmTool(shell, section, "species");
    const sdmCard = container.querySelector('[data-tool="sdm"]')!;
    const selects = [
      ...sdmCard.querySelectorAll("select"),
    ] as HTMLSelectElement[];
    choose(selects[0], presenceLayer.id);
    choose(selects[1], gridLayer.id);
    choose(selects[2], "logistic");
    choose(selects[3], "bio1");
    choose(selects[4], "bio12");
    const evaluate = [...sdmCard.querySelectorAll("input[type=checkbox]")].find(
      (input) => input.parentElement?.textContent?.includes("cross-validation")
    ) as HTMLInputElement;
    evaluate.checked = true;
    const fit = [...sdmCard.querySelectorAll("button")].find(
      (b) => b.textContent === "Fit and predict SDM"
    ) as HTMLButtonElement;
    fit.click();
    await settle();
    const text = sdmCard.textContent ?? "";
    assert.match(text, /Spatially blocked cross-validation/, text.slice(-400));
    assert.match(text, /ROC AUC/);
    // Grid-backed prediction layer → raster output controls.
    assert.match(text, /Download suitability GeoTIFF/);
    assert.match(text, /use the GeoTIFF download instead/); // test host has no MapLibre map
  });
});

describe("pixelWindowFor", () => {
  // CHELSA-like global grid: 1/120° pixels, origin at (-180, 84).
  const origin: [number, number] = [-180, 84];
  const res: [number, number] = [1 / 120, -1 / 120];
  const size: [number, number] = [43200, 20880];
  it("maps lon/lat bounds to pixel columns and rows", () => {
    assert.deepEqual(
      pixelWindowFor([140, -12, 156, -1], origin, res, size),
      [38400, 10200, 40320, 11520]
    );
  });
  it("rejects bounds outside the raster or south-up rasters", () => {
    assert.equal(pixelWindowFor([140, 80, 150, 89], origin, res, size), null);
    assert.equal(pixelWindowFor([0, 0, 1, 1], origin, [1, 1], size), null);
  });
});

describe("readRemoteGrid over HTTP range requests", () => {
  it("reads a window of a remote GeoTIFF onto the grid, north row first", async () => {
    // 40 × 20 raster covering lon 0..4, lat 0..2 at 0.1°; value = 5·row + col (fits the writer's 8-bit default).
    const width = 40;
    const height = 20;
    const values = Array.from(
      { length: width * height },
      (_, i) => 5 * Math.floor(i / width) + (i % width)
    );
    const buffer = writeArrayBuffer(values, {
      width,
      height,
      ModelPixelScale: [0.1, 0.1, 0],
      ModelTiepoint: [0, 0, 0, 0, 2, 0],
      GeographicTypeGeoKey: 4326,
      GTModelTypeGeoKey: 2,
      GDAL_NODATA: "255",
    }) as ArrayBuffer;
    const bytes = Buffer.from(buffer);
    let rangeRequests = 0;
    const server = createServer((req, res) => {
      const range = /bytes=(\d+)-(\d*)/.exec(req.headers.range ?? "");
      if (!range) {
        res.writeHead(200, { "Content-Length": bytes.length });
        res.end(bytes);
        return;
      }
      rangeRequests++;
      const start = Number(range[1]);
      const end = Math.min(
        bytes.length - 1,
        range[2] ? Number(range[2]) : bytes.length - 1
      );
      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${bytes.length}`,
        "Content-Length": end - start + 1,
        "Accept-Ranges": "bytes",
      });
      res.end(bytes.subarray(start, end + 1));
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve)
    );
    try {
      const { port } = server.address() as AddressInfo;
      // Window lon 1..3, lat 0.5..1.5 → source cols 10..29, rows 5..14; 4 × 2 output cells.
      const grid = {
        bounds: [1, 0.5, 3, 1.5] as [number, number, number, number],
        width: 4,
        height: 2,
      };
      const result = await readRemoteGrid(
        `http://127.0.0.1:${port}/test.tif`,
        grid
      );
      assert.ok(rangeRequests > 0, "expected HTTP range requests");
      assert.equal(result.nodata, 255);
      // Nearest neighbour at output cell centres: cols 12,17,22,27; rows 7 (north) and 12.
      assert.deepEqual(result.values, [47, 52, 57, 62, 72, 77, 82, 87]);
      await assert.rejects(
        readRemoteGrid(`http://127.0.0.1:${port}/test.tif`, {
          bounds: [3, 1, 5, 3],
          width: 2,
          height: 2,
        }),
        /outside this raster/
      );
    } finally {
      server.close();
    }
  });
});

describe("background mask", () => {
  // Land square 0..2 × 0..2 with a lake (hole) 0.5..1 × 0.5..1, plus an island at 3..4.
  const land = {
    type: "MultiPolygon" as const,
    coordinates: [
      [
        [
          [0, 0],
          [2, 0],
          [2, 2],
          [0, 2],
          [0, 0],
        ],
        [
          [0.5, 0.5],
          [1, 0.5],
          [1, 1],
          [0.5, 1],
          [0.5, 0.5],
        ],
      ],
      [
        [
          [3, 0],
          [4, 0],
          [4, 1],
          [3, 1],
          [3, 0],
        ],
      ],
    ],
  };

  it("tests points against polygons, holes and multipolygon parts", () => {
    assert.equal(pointInMask(1.5, 1.5, [land]), true);
    assert.equal(pointInMask(0.75, 0.75, [land]), false); // lake
    assert.equal(pointInMask(3.5, 0.5, [land]), true); // island
    assert.equal(pointInMask(2.5, 0.5, [land]), false); // sea
  });

  it("drops background cells whose centre is outside the mask", () => {
    // 4 × 2 grid over lon 0..4, lat 0..2; centres at x 0.5,1.5,2.5,3.5 and y 1.5,0.5.
    const grid = {
      bounds: [0, 0, 4, 2] as [number, number, number, number],
      width: 4,
      height: 2,
    };
    const values = [1, 2, 3, 4, 5, 6, 7, 8];
    const result = sampleCovariates(
      grid,
      [{ field: "a", values, nodata: null }],
      [pt(2.5, 1.5), pt(1.5, 1.5)],
      {},
      [land]
    )!;
    // Land centres: (0.5,1.5) (1.5,1.5) (1.5,0.5) and the island (3.5,0.5). Sea centres:
    // (2.5,1.5) (3.5,1.5) (2.5,0.5). (0.5,0.5) sits on the lake's corner, so either side is fine.
    const kept = result.background.map((f) => f.properties?.a);
    assert.ok(
      kept.includes(1) &&
        kept.includes(2) &&
        kept.includes(6) &&
        kept.includes(8)
    );
    assert.ok(!kept.includes(3) && !kept.includes(4) && !kept.includes(7)); // sea cells
    assert.equal(
      result.backgroundMasked +
        result.backgroundCells +
        result.backgroundDropped,
      8
    );
    assert.equal(result.presencesOutsideMask, 1); // the presence at sea
    assert.match(String(result.provenance.params.backgroundMask), /polygon/);
  });
});

describe("undeclaredIntegerNodata", () => {
  const image = (bits: number, format: number) => ({
    getBitsPerSample: () => bits,
    getSampleFormat: () => format,
  });
  it("uses the integer type's sentinel and leaves floats alone", () => {
    assert.equal(undeclaredIntegerNodata(image(16, 1)), 65535);
    assert.equal(undeclaredIntegerNodata(image(8, 1)), 255);
    assert.equal(undeclaredIntegerNodata(image(16, 2)), -32768);
    assert.equal(undeclaredIntegerNodata(image(32, 3)), null);
  });
});

describe("suggestFieldName for local rasters", () => {
  it("recognises bioclim numbering in common file names", () => {
    assert.equal(suggestFieldName("PNG_BIO1_30s.tif"), "bio1");
    assert.equal(suggestFieldName("PNG_BIO12_30s"), "bio12");
    assert.equal(suggestFieldName("wc2.1_30s_bio_15.tif"), "bio15");
    assert.equal(suggestFieldName("CHELSA_bio04_1981-2010"), "bio4");
    assert.equal(suggestFieldName("bio120_custom"), "bio120_custom"); // not a BIO index
  });

  it("recognises elevation rasters", () => {
    assert.equal(suggestFieldName("PNG_elevation_30s.tif"), "elev");
    assert.equal(suggestFieldName("SRTM_90m"), "elev");
    assert.equal(suggestFieldName("png-dem"), "elev");
    assert.equal(suggestFieldName("salt_marsh"), "salt_marsh"); // no false "alt"
  });
});

describe("uncoveredGridCorners", () => {
  // Raster covering lon 141–147, lat −10…−2; a reader returns nothing outside it.
  const read = async (
    _id: string,
    options: { bounds: [number, number, number, number] }
  ) => {
    const [w, s, e, n] = options.bounds;
    const overlaps = e > 141 && w < 147 && n > -10 && s < -2;
    return { values: overlaps ? [1, 1, 1, 1] : [] };
  };

  it("passes when the raster covers the whole grid", async () => {
    const grid = {
      bounds: [141.5, -9, 146, -3] as [number, number, number, number],
      width: 10,
      height: 10,
    };
    assert.deepEqual(await uncoveredGridCorners(read, "r", grid), []);
  });

  it("names the corners a too-small raster misses", async () => {
    // Buffer pushed the grid west of 141°E (into Indonesia).
    const grid = {
      bounds: [140.5, -9, 146, -3] as [number, number, number, number],
      width: 11,
      height: 12,
    };
    assert.deepEqual(await uncoveredGridCorners(read, "r", grid), [
      "north-west",
      "south-west",
    ]);
  });
});
