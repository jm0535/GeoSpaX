// Copernicus DEM GLO-90 covariate source: tile naming (matches the AWS
// open-data keys), tile coverage, overview choice, centre-pixel sampling, and
// an HTTP mosaic where absent tiles (ocean) return 404.

import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, it } from "node:test";
import { writeArrayBuffer } from "geotiff";
import {
  chooseImageLevel,
  copernicusTileName,
  copernicusTileUrl,
  readCopernicusDemGrid,
  sampleTileIntoGrid,
  tilesForGrid,
} from "../packages/geospax-plugins/src/shared/dem-source";

describe("Copernicus tile naming", () => {
  it("names tiles by their south-west corner like the AWS bucket", () => {
    // Real key, verified: covers lon 145–146, lat −7…−6.
    assert.equal(
      copernicusTileName(-7, 145),
      "Copernicus_DSM_COG_30_S07_00_E145_00_DEM"
    );
    assert.equal(
      copernicusTileName(5, -3),
      "Copernicus_DSM_COG_30_N05_00_W003_00_DEM"
    );
    assert.equal(
      copernicusTileUrl("https://x.org/copdem/", -7, 145),
      "https://x.org/copdem/Copernicus_DSM_COG_30_S07_00_E145_00_DEM/Copernicus_DSM_COG_30_S07_00_E145_00_DEM.tif"
    );
  });

  it("lists every 1° tile the grid touches", () => {
    const tiles = tilesForGrid({
      bounds: [144.5, -7.5, 146, -6],
      width: 30,
      height: 30,
    });
    assert.deepEqual(
      tiles.map((t) => `${t.latSouth},${t.lonWest}`),
      ["-8,144", "-8,145", "-7,144", "-7,145"]
    );
  });

  it("picks the coarsest overview at most half a cell", () => {
    // GLO-90 levels: 1/1200°, 1/600°, 1/300°.
    const levels = [1 / 1200, 1 / 600, 1 / 300];
    assert.equal(chooseImageLevel(levels, 0.05), 2);
    assert.equal(chooseImageLevel(levels, 0.004), 1);
    assert.equal(chooseImageLevel(levels, 0.001), 0);
  });
});

describe("sampleTileIntoGrid", () => {
  it("writes the pixel under each cell centre and skips NoData", () => {
    const grid = {
      bounds: [0, 0, 2, 1] as [number, number, number, number],
      width: 2,
      height: 1,
    };
    const values = new Float64Array(2).fill(Number.NaN);
    // Tile covering lon 0–1, lat 0–1 at 0.25°: value = 10·row + col.
    const data = Array.from(
      { length: 16 },
      (_, i) => 10 * Math.floor(i / 4) + (i % 4)
    );
    data[2 * 4 + 2] = -32767;
    const written = sampleTileIntoGrid(grid, values, {
      originX: 0,
      originY: 1,
      resX: 0.25,
      resY: -0.25,
      width: 4,
      height: 4,
      data,
      nodata: -32767,
    });
    // Cell 0 centre (0.5, 0.5) → pixel (2, 2) = NoData; cell 1 is outside the tile.
    assert.equal(written, 0);
    assert.ok(Number.isNaN(values[0]) && Number.isNaN(values[1]));
    data[2 * 4 + 2] = 22;
    sampleTileIntoGrid(grid, values, {
      originX: 0,
      originY: 1,
      resX: 0.25,
      resY: -0.25,
      width: 4,
      height: 4,
      data,
      nodata: -32767,
    });
    assert.equal(values[0], 22);
  });
});

describe("readCopernicusDemGrid over HTTP", () => {
  it("mosaics present tiles and leaves 404 (ocean) tiles empty", async () => {
    const tile = (base: number) =>
      Buffer.from(
        writeArrayBuffer(
          new Float32Array(Array.from({ length: 100 }, (_, i) => base + i)),
          {
            width: 10,
            height: 10,
            BitsPerSample: [32],
            SampleFormat: [3],
            SamplesPerPixel: 1,
            ModelPixelScale: [0.1, 0.1, 0],
            ModelTiepoint: [0, 0, 0, base === 1000 ? 145 : 146, -6, 0],
            GeographicTypeGeoKey: 4326,
            GTModelTypeGeoKey: 2,
          }
        ) as ArrayBuffer
      );
    const files = new Map([
      [
        `/${copernicusTileName(-7, 145)}/${copernicusTileName(-7, 145)}.tif`,
        tile(1000),
      ],
      [
        `/${copernicusTileName(-7, 146)}/${copernicusTileName(-7, 146)}.tif`,
        tile(2000),
      ],
    ]);
    // The first HEAD for the 146 tile 404s transiently; a retry must still read it.
    let flaky = true;
    const server = createServer((req, res) => {
      const body = files.get(req.url ?? "");
      if (
        body &&
        flaky &&
        req.method === "HEAD" &&
        (req.url ?? "").includes("E146")
      ) {
        flaky = false;
        res.writeHead(404).end();
        return;
      }
      if (!body) {
        res.writeHead(404).end();
        return;
      }
      if (req.method === "HEAD") {
        res.writeHead(200, { "Content-Length": body.length }).end();
        return;
      }
      const range = /bytes=(\d+)-(\d*)/.exec(req.headers.range ?? "");
      const start = range ? Number(range[1]) : 0;
      const end = range?.[2]
        ? Math.min(body.length - 1, Number(range[2]))
        : body.length - 1;
      res.writeHead(range ? 206 : 200, {
        "Content-Range": `bytes ${start}-${end}/${body.length}`,
        "Content-Length": end - start + 1,
      });
      res.end(body.subarray(start, end + 1));
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve)
    );
    try {
      const { port } = server.address() as AddressInfo;
      // Grid lon 145–148 × lat −7…−6 at 0.5°: tiles 145 and 146 exist, 147 is "ocean".
      const grid = {
        bounds: [145, -7, 148, -6] as [number, number, number, number],
        width: 6,
        height: 2,
      };
      const result = await readCopernicusDemGrid(
        `http://127.0.0.1:${port}`,
        grid
      );
      assert.equal(result.tilesRead, 2);
      assert.equal(result.tilesMissing, 1);
      assert.equal(result.tilesFailed, 0);
      assert.equal(flaky, false, "the transient 404 was exercised");
      // Row 0 centre lat −6.25 → tile row 2; cols at lon 145.25/145.75 → tile cols 2/7.
      assert.equal(result.values[0], 1000 + 2 * 10 + 2);
      assert.equal(result.values[1], 1000 + 2 * 10 + 7);
      assert.equal(result.values[2], 2000 + 2 * 10 + 2);
      assert.ok(
        Number.isNaN(result.values[4]) && Number.isNaN(result.values[5])
      ); // ocean tile
      await assert.rejects(
        readCopernicusDemGrid(`http://127.0.0.1:${port}`, {
          bounds: [0, 0, 1, 1],
          width: 2,
          height: 2,
        }),
        /No Copernicus DEM tiles/
      );
    } finally {
      server.close();
    }
  });
});

describe("readCopernicusDemGrid with tileList.txt", () => {
  it("skips tiles absent from the list without requesting them", async () => {
    const name = copernicusTileName(-7, 145);
    const body = Buffer.from(
      writeArrayBuffer(new Float32Array(100).fill(500), {
        width: 10,
        height: 10,
        BitsPerSample: [32],
        SampleFormat: [3],
        SamplesPerPixel: 1,
        ModelPixelScale: [0.1, 0.1, 0],
        ModelTiepoint: [0, 0, 0, 145, -6, 0],
        GeographicTypeGeoKey: 4326,
        GTModelTypeGeoKey: 2,
      }) as ArrayBuffer
    );
    const requested: string[] = [];
    let failOnce = true;
    const server = createServer((req, res) => {
      requested.push(`${req.method} ${req.url}`);
      if (req.url === "/tileList.txt") {
        res
          .writeHead(200)
          .end(`${name}\nCopernicus_DSM_COG_30_N00_00_E000_00_DEM\n`);
        return;
      }
      if (req.url !== `/${name}/${name}.tif`) {
        res.writeHead(404).end();
        return;
      }
      if (failOnce) {
        failOnce = false; // transient error on a listed tile → retried
        res.writeHead(503).end();
        return;
      }
      const range = /bytes=(\d+)-(\d*)/.exec(req.headers.range ?? "");
      const start = range ? Number(range[1]) : 0;
      const end = range?.[2]
        ? Math.min(body.length - 1, Number(range[2]))
        : body.length - 1;
      res.writeHead(range ? 206 : 200, {
        "Content-Range": `bytes ${start}-${end}/${body.length}`,
        "Content-Length": end - start + 1,
      });
      res.end(body.subarray(start, end + 1));
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve)
    );
    try {
      const { port } = server.address() as AddressInfo;
      const grid = {
        bounds: [145, -7, 148, -6] as [number, number, number, number],
        width: 6,
        height: 2,
      };
      const result = await readCopernicusDemGrid(
        `http://127.0.0.1:${port}/`,
        grid
      );
      assert.equal(result.tilesRead, 1);
      assert.equal(result.tilesMissing, 2);
      assert.equal(result.tilesFailed, 0);
      assert.equal(result.values[0], 500);
      assert.ok(
        !requested.some((line) => line.startsWith("HEAD")),
        "no HEAD probes"
      );
      assert.ok(
        !requested.some((line) => /E146|E147/.test(line)),
        "ocean tiles never requested"
      );
    } finally {
      server.close();
    }
  });
});
