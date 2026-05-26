import { beforeEach, describe, expect, it } from "vitest";
import {
  annotateDistanceElement,
  findDistanceElements,
  parseDistanceText
} from "@/content/sidebarRoutes";
import type { PriceQuote, UserSettings } from "@/shared/types";

describe("Google Maps sidebar distance parsing", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("parses kilometer labels from route sidebar", () => {
    expect(parseDistanceText("214 km")).toMatchObject({
      distanceKm: 214,
      raw: "214 km"
    });
  });

  it("parses decimal comma kilometer labels", () => {
    expect(parseDistanceText("12,5 km")?.distanceKm).toBe(12.5);
  });

  it("parses dotted kilometer thousands separators", () => {
    expect(parseDistanceText("1.323 km")?.distanceKm).toBe(1323);
  });

  it("parses dotted decimal kilometer labels", () => {
    expect(parseDistanceText("12.5 km")?.distanceKm).toBe(12.5);
  });

  it("converts miles to kilometers", () => {
    expect(parseDistanceText("10 mi")?.distanceKm).toBeCloseTo(16.09344);
  });

  it("uses dotted kilometer thousands separators for rendered costs", () => {
    const element = document.createElement("div");
    element.textContent = "1.323 km";

    annotateDistanceElement(element, settings, price);

    expect(element.textContent).toContain("€171.99");
  });

  it("does not render costs when walking mode is selected", () => {
    document.body.innerHTML = `
      <button aria-pressed="true" aria-label="Walking"></button>
      <div>4 km</div>
    `;

    expect(findDistanceElements()).toHaveLength(0);
  });

  it("does not render costs for walking route sections", () => {
    const section = document.createElement("div");
    section.setAttribute("role", "listitem");
    section.innerHTML = '<span aria-label="Walking"></span><div>1.2 km</div>';
    const distance = section.querySelector<HTMLElement>("div")!;

    annotateDistanceElement(distance, settings, price);

    expect(distance.querySelector(".fuel-cost-inline")).toBeNull();
  });

  it("renders costs for driving route sections", () => {
    const section = document.createElement("div");
    section.setAttribute("role", "listitem");
    section.innerHTML = '<span aria-label="Driving"></span><div>10 km</div>';
    const distance = section.querySelector<HTMLElement>("div")!;

    annotateDistanceElement(distance, settings, price);

    expect(distance.textContent).toContain("€1.30");
  });

  it("ignores duration-only labels", () => {
    expect(parseDistanceText("2 hr 10 min")).toBeNull();
  });
});

const settings: UserSettings = {
  country: "NL",
  currency: "EUR",
  fuelType: "gasoline_95",
  economy: { value: 6.5, unit: "l_per_100km" },
  overrides: [],
  plateCountry: "NL",
  savePlate: false
};

const price: PriceQuote = {
  country: "NL",
  fuel: "gasoline_95",
  available: true,
  pricePerLiter: 2,
  currency: "EUR",
  source: "provider"
};
