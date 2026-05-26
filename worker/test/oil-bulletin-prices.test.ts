import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { parseOilBulletinWorkbook } from "../src/adapters/prices";

describe("European Commission oil bulletin adapter", () => {
  it("extracts country fuel prices from the latest prices workbook", async () => {
    const workbook = await createWorkbook();
    const report = await parseOilBulletinWorkbook(workbook, {
      reportDate: "2026-05-21",
      url: "https://energy.ec.europa.eu/document/download/latest.xlsx"
    });

    expect(report.countries.NL).toMatchObject({
      gasoline_95: 2.388,
      diesel: 2.285,
      lpg: 0.997
    });
    expect(report.countries.BE).toMatchObject({
      gasoline_95: 1.889,
      diesel: 2.112,
      lpg: 0.894
    });
  });

  it("fails clearly when the workbook sheet is missing", async () => {
    const zip = new JSZip();
    zip.file("xl/sharedStrings.xml", "<sst></sst>");

    await expect(
      parseOilBulletinWorkbook(await zip.generateAsync({ type: "arraybuffer" }), {
        reportDate: "2026-05-21",
        url: "https://energy.ec.europa.eu/document/download/latest.xlsx"
      })
    ).rejects.toThrow("Oil Bulletin workbook sheet missing");
  });
});

async function createWorkbook(): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file("xl/sharedStrings.xml", `<?xml version="1.0" encoding="UTF-8"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <si><t>in EUR</t></si>
  <si><t>Euro-super 95  (I)</t></si>
  <si><t>Gas oil automobile Automotive gas oil Dieselkraftstoff (I)</t></si>
  <si><t>GPL pour moteur LPG motor fuel</t></si>
  <si><t>Belgium</t></si>
  <si><t>Netherlands</t></si>
</sst>`);
  zip.file("xl/worksheets/sheet1.xml", `<?xml version="1.0" encoding="UTF-8"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1">
      <c r="A1" t="s"><v>0</v></c>
      <c r="B1" t="s"><v>1</v></c>
      <c r="C1" t="s"><v>2</v></c>
      <c r="G1" t="s"><v>3</v></c>
    </row>
    <row r="3">
      <c r="A3" t="s"><v>4</v></c>
      <c r="B3"><v>1888.77</v></c>
      <c r="C3"><v>2111.86</v></c>
      <c r="G3"><v>894</v></c>
    </row>
    <row r="4">
      <c r="A4" t="s"><v>5</v></c>
      <c r="B4"><v>2388.04</v></c>
      <c r="C4"><v>2284.71</v></c>
      <c r="G4"><v>997.29</v></c>
    </row>
  </sheetData>
</worksheet>`);
  return zip.generateAsync({ type: "arraybuffer" });
}
