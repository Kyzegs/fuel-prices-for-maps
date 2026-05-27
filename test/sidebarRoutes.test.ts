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
      <button aria-pressed="true">
        <span class="google-symbols" aria-hidden="true">&#xe536;</span>
      </button>
      <div>4 km</div>
    `;

    expect(findDistanceElements()).toHaveLength(0);
  });

  it("does not render costs when biking mode is selected", () => {
    document.body.innerHTML = `
      <button aria-pressed="true">
        <span class="google-symbols" aria-hidden="true">&#xe52f;</span>
      </button>
      <div>4 km</div>
    `;

    expect(findDistanceElements()).toHaveLength(0);
  });

  it("renders costs for the selected car mode icon regardless of label language", () => {
    document.body.innerHTML = `
      <button class="m6Uuef" role="radio" aria-checked="true" data-tooltip="Voiture">
        <div class="OzmNAc" role="img" aria-label="Voiture">
          <div class="K5lSDf O3YrQd">
            <div class="OyjIsf "></div>
            <span class="OzmNAc google-symbols NhBTye" aria-hidden="true">&#xe531;</span>
          </div>
        </div>
        <div class="Fl2iee" aria-hidden="false">25 min.</div>
        <div class="QhtoGe"></div>
      </button>
      <div>10 km</div>
    `;
    const distance = document.querySelector<HTMLElement>("body > div")!;

    annotateDistanceElement(distance, settings, price);

    expect(distance.textContent).toContain("€1.30");
  });

  it("does not render costs for the selected walking mode icon regardless of label language", () => {
    document.body.innerHTML = `
      <button class="m6Uuef" role="radio" aria-checked="true" data-tooltip="Caminar">
        <div class="OzmNAc" role="img" aria-label="Caminar">
          <span class="OzmNAc google-symbols NhBTye" aria-hidden="true">&#xe536;</span>
        </div>
        <div class="Fl2iee" aria-hidden="false">42 min.</div>
      </button>
      <div>4 km</div>
    `;

    expect(findDistanceElements()).toHaveLength(0);
  });

  it("does not render costs for the selected biking mode icon regardless of label language", () => {
    document.body.innerHTML = `
      <button class="m6Uuef" role="radio" aria-checked="true" data-tooltip="Radfahren">
        <div class="OzmNAc" role="img" aria-label="Radfahren">
          <span class="OzmNAc google-symbols NhBTye" aria-hidden="true">&#xe52f;</span>
        </div>
        <div class="Fl2iee" aria-hidden="false">12 min.</div>
      </button>
      <div>4 km</div>
    `;

    expect(findDistanceElements()).toHaveLength(0);
  });

  it("does not render costs for walking route sections", () => {
    const section = document.createElement("div");
    section.setAttribute("role", "listitem");
    section.innerHTML =
      '<span class="google-symbols" aria-hidden="true">&#xe536;</span><div>1.2 km</div>';
    const distance = section.querySelector<HTMLElement>("div")!;

    annotateDistanceElement(distance, settings, price);

    expect(distance.querySelector(".fuel-cost-inline")).toBeNull();
  });

  it("does not render costs for biking route sections", () => {
    const section = document.createElement("div");
    section.setAttribute("role", "listitem");
    section.innerHTML =
      '<span class="google-symbols" aria-hidden="true">&#xe52f;</span><div>1.2 km</div>';
    const distance = section.querySelector<HTMLElement>("div")!;

    annotateDistanceElement(distance, settings, price);

    expect(distance.querySelector(".fuel-cost-inline")).toBeNull();
  });

  it("removes existing costs when a route section switches to biking", () => {
    const section = document.createElement("div");
    section.setAttribute("role", "listitem");
    section.innerHTML =
      '<span class="google-symbols" aria-hidden="true">&#xe531;</span><div>10 km</div>';
    const mode = section.querySelector<HTMLElement>("span")!;
    const distance = section.querySelector<HTMLElement>("div")!;

    annotateDistanceElement(distance, settings, price);
    expect(distance.querySelector(".fuel-cost-inline")).not.toBeNull();

    mode.textContent = "\ue52f";
    annotateDistanceElement(distance, settings, price);

    expect(distance.querySelector(".fuel-cost-inline")).toBeNull();
  });

  it("removes existing costs during discovery when selected mode switches to walking", () => {
    document.body.innerHTML = `
      <button aria-pressed="true">
        <span class="google-symbols" aria-hidden="true">&#xe531;</span>
      </button>
      <div>4 km</div>
    `;
    const mode = document.querySelector<HTMLElement>(".google-symbols")!;
    const distance = document.querySelector<HTMLElement>("div")!;

    annotateDistanceElement(distance, settings, price);
    expect(distance.querySelector(".fuel-cost-inline")).not.toBeNull();

    mode.textContent = "\ue536";
    expect(findDistanceElements()).toHaveLength(0);

    expect(distance.querySelector(".fuel-cost-inline")).toBeNull();
  });

  it("renders costs for driving route sections", () => {
    const section = document.createElement("div");
    section.setAttribute("role", "listitem");
    section.innerHTML =
      '<span class="google-symbols" aria-hidden="true">&#xe531;</span><div>10 km</div>';
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
  plateCountry: "NL",
  savedVehicles: []
};

const price: PriceQuote = {
  country: "NL",
  fuel: "gasoline_95",
  available: true,
  pricePerLiter: 2,
  currency: "EUR",
  source: "provider"
};
