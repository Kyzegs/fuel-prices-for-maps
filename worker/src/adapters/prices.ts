import JSZip from "jszip";
import {
  SUPPORTED_PRICE_FUEL_TYPES,
  type FuelType,
  type PriceQuote
} from "../../../src/shared/types";
import type { Env } from "../env";
import type { PriceProvider } from "../providers";

const BULLETIN_URL = "https://energy.ec.europa.eu/data-and-analysis/weekly-oil-bulletin_en";
const LATEST_REPORT_KEY = "ec-oil-bulletin:latest";
const REPORT_KEY_PREFIX = "ec-oil-bulletin:report:";

const COUNTRY_CODES: Record<string, string> = {
  Austria: "AT",
  Belgium: "BE",
  Bulgaria: "BG",
  Croatia: "HR",
  Cyprus: "CY",
  Czechia: "CZ",
  Denmark: "DK",
  Estonia: "EE",
  Finland: "FI",
  France: "FR",
  Germany: "DE",
  Greece: "GR",
  Hungary: "HU",
  Ireland: "IE",
  Italy: "IT",
  Latvia: "LV",
  Lithuania: "LT",
  Luxembourg: "LU",
  Malta: "MT",
  Netherlands: "NL",
  Poland: "PL",
  Portugal: "PT",
  Romania: "RO",
  Slovakia: "SK",
  Slovenia: "SI",
  Spain: "ES",
  Sweden: "SE"
};

const FUEL_COLUMNS: Record<FuelType, string | undefined> = {
  gasoline_95: "B",
  gasoline_98: undefined,
  diesel: "C",
  diesel_plus: undefined,
  lpg: "G",
  e85: undefined,
  cng: undefined
};

interface OilBulletinReport {
  reportDate: string;
  sourceUrl: string;
  importedAt: string;
  countries: Record<string, Partial<Record<FuelType, number>>>;
}

export async function getLatestPrice(
  env: Env,
  country: string,
  fuel: FuelType,
  currency = "EUR",
  options: { refresh?: boolean } = {}
): Promise<PriceQuote> {
  const normalizedCountry = country.toUpperCase();
  const report = await getLatestReport(env, options);
  const pricePerLiter = report.countries[normalizedCountry]?.[fuel];

  if (pricePerLiter !== undefined) {
    return {
      country: normalizedCountry,
      fuel,
      available: true,
      pricePerLiter,
      currency,
      source: "provider",
      updatedAt: report.reportDate,
      diagnostics: {
        provider: "ec-oil-bulletin",
        message: `European Commission Weekly Oil Bulletin ${report.reportDate}`
      }
    };
  }

  return {
    country: normalizedCountry,
    fuel,
    available: false,
    currency,
    source: "unavailable",
    updatedAt: report.reportDate,
    diagnostics: {
      provider: "ec-oil-bulletin",
      message: "Fuel/country price unavailable in European Commission Weekly Oil Bulletin"
    }
  };
}

export const ecOilBulletinPriceProvider: PriceProvider = {
  id: "ec-oil-bulletin",
  getLatestPrice,
  sync: syncPrices
};

export async function syncPrices(env: Env) {
  const report = await importLatestReport(env, { force: true });
  const quotes: PriceQuote[] = [];

  for (const [country, prices] of Object.entries(report.countries)) {
    for (const fuel of SUPPORTED_PRICE_FUEL_TYPES) {
      const pricePerLiter = prices[fuel];
      if (pricePerLiter === undefined) continue;
      quotes.push({
        country,
        fuel,
        available: true,
        pricePerLiter,
        currency: "EUR",
        source: "provider",
        updatedAt: report.reportDate,
        diagnostics: {
          provider: "ec-oil-bulletin",
          message: `European Commission Weekly Oil Bulletin ${report.reportDate}`
        }
      });
    }
  }

  return quotes;
}

async function getLatestReport(
  env: Env,
  options: { refresh?: boolean } = {}
): Promise<OilBulletinReport> {
  if (!options.refresh) {
    const cached = await readLatestReport(env);
    if (cached) return cached;
  }

  try {
    return await importLatestReport(env, { force: options.refresh });
  } catch (error) {
    const cached = await readLatestReport(env);
    if (cached) return cached;
    throw error;
  }
}

async function importLatestReport(
  env: Env,
  options: { force?: boolean } = {}
): Promise<OilBulletinReport> {
  const latestFile = await findLatestPricesWithTaxesFile();

  if (!options.force) {
    const existing = await readReport(env, latestFile.reportDate);
    if (existing) {
      await writeLatestReport(env, existing);
      return existing;
    }
  }

  const report = await fetchOilBulletinReport(latestFile);
  await writeReport(env, report);
  await writeLatestReport(env, report);
  return report;
}

async function findLatestPricesWithTaxesFile(): Promise<{ reportDate: string; url: string }> {
  const response = await fetch(BULLETIN_URL);
  if (!response.ok) throw new Error(`Oil Bulletin page fetch failed: ${response.status}`);

  const html = await response.text();
  const titleIndex = html.indexOf("Prices with taxes latest prices (xlsx)");
  const blockStart = titleIndex >= 0 ? html.lastIndexOf('<div class="ecl-file"', titleIndex) : -1;
  const blockEnd =
    titleIndex >= 0 ? html.indexOf('<div class="ecl-file"', titleIndex + 1) : -1;
  const fileBlock =
    blockStart >= 0
      ? html.slice(blockStart, blockEnd > blockStart ? blockEnd : blockStart + 4000)
      : undefined;
  if (!fileBlock) throw new Error("Oil Bulletin prices with taxes XLSX link not found");

  const reportDate = parseReportDate(
    htmlDecode(fileBlock.match(/ecl-file__detail-meta-item">([^<]+)/)?.[1] || "")
  );
  const href = htmlDecode(fileBlock.match(/href="([^"]+\.xlsx[^"]*)"/)?.[1] || "");
  if (!reportDate || !href) throw new Error("Oil Bulletin XLSX metadata missing");

  return {
    reportDate,
    url: new URL(href, BULLETIN_URL).toString()
  };
}

async function fetchOilBulletinReport(file: {
  reportDate: string;
  url: string;
}): Promise<OilBulletinReport> {
  const response = await fetch(file.url);
  if (!response.ok) throw new Error(`Oil Bulletin XLSX fetch failed: ${response.status}`);

  return parseOilBulletinWorkbook(await response.arrayBuffer(), file);
}

export async function parseOilBulletinWorkbook(
  workbookBytes: ArrayBuffer,
  source: { reportDate: string; url: string }
): Promise<OilBulletinReport> {
  const zip = await JSZip.loadAsync(workbookBytes);
  const sharedStringsXml = await zip.file("xl/sharedStrings.xml")?.async("text");
  const sheetXml = await zip.file("xl/worksheets/sheet1.xml")?.async("text");
  if (!sheetXml) throw new Error("Oil Bulletin workbook sheet missing");

  const sharedStrings = sharedStringsXml ? parseSharedStrings(sharedStringsXml) : [];
  const rows = parseSheetRows(sheetXml, sharedStrings);
  const countries: OilBulletinReport["countries"] = {};

  for (const row of rows) {
    const countryName = row.A;
    if (!countryName) continue;
    const countryCode = COUNTRY_CODES[countryName];
    if (!countryCode) continue;

    const prices: Partial<Record<FuelType, number>> = {};
    for (const fuel of SUPPORTED_PRICE_FUEL_TYPES) {
      const column = FUEL_COLUMNS[fuel];
      const rawPrice = column ? Number(row[column]) : Number.NaN;
      if (Number.isFinite(rawPrice)) prices[fuel] = round(rawPrice / 1000, 3);
    }
    countries[countryCode] = prices;
  }

  return {
    reportDate: source.reportDate,
    sourceUrl: source.url,
    importedAt: new Date().toISOString(),
    countries
  };
}

function parseSharedStrings(xml: string): string[] {
  return [...xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((match) =>
    [...match[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)]
      .map((textMatch) => xmlDecode(textMatch[1]))
      .join("")
  );
}

function parseSheetRows(xml: string, sharedStrings: string[]): Array<Record<string, string>> {
  return [...xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)].map((rowMatch) => {
    const row: Record<string, string> = {};
    for (const cellMatch of rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attrs = cellMatch[1];
      const body = cellMatch[2];
      const ref = attrs.match(/\br="([A-Z]+)\d+"/)?.[1];
      if (!ref) continue;

      const type = attrs.match(/\bt="([^"]+)"/)?.[1];
      const rawValue = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      if (rawValue === undefined) continue;
      row[ref] = type === "s" ? sharedStrings[Number(rawValue)] || "" : xmlDecode(rawValue);
    }
    return row;
  });
}

async function readLatestReport(env: Env): Promise<OilBulletinReport | undefined> {
  const latest = await env.PRICE_CACHE?.get(LATEST_REPORT_KEY);
  return latest ? (JSON.parse(latest) as OilBulletinReport) : undefined;
}

async function readReport(env: Env, reportDate: string): Promise<OilBulletinReport | undefined> {
  const stored = await env.PRICE_CACHE?.get(reportKey(reportDate));
  return stored ? (JSON.parse(stored) as OilBulletinReport) : undefined;
}

async function writeLatestReport(env: Env, report: OilBulletinReport): Promise<void> {
  await env.PRICE_CACHE?.put(LATEST_REPORT_KEY, JSON.stringify(report));
}

async function writeReport(env: Env, report: OilBulletinReport): Promise<void> {
  await env.PRICE_CACHE?.put(reportKey(report.reportDate), JSON.stringify(report));
}

function reportKey(reportDate: string): string {
  return `${REPORT_KEY_PREFIX}${reportDate}`;
}

function parseReportDate(value: string): string | undefined {
  const match = value.trim().match(/^(\d{1,2})\s+([A-Z]+)\s+(\d{4})$/i);
  if (!match) return undefined;

  const months: Record<string, string> = {
    JANUARY: "01",
    FEBRUARY: "02",
    MARCH: "03",
    APRIL: "04",
    MAY: "05",
    JUNE: "06",
    JULY: "07",
    AUGUST: "08",
    SEPTEMBER: "09",
    OCTOBER: "10",
    NOVEMBER: "11",
    DECEMBER: "12"
  };
  const month = months[match[2].toUpperCase()];
  if (!month) return undefined;
  return `${match[3]}-${month}-${match[1].padStart(2, "0")}`;
}

function htmlDecode(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function xmlDecode(value: string): string {
  return htmlDecode(value).replace(/&apos;/g, "'");
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
