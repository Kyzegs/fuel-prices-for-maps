import { litersForDistance, refuelsForDistance, round } from "../shared/fuel";
import type { PriceQuote, UserSettings } from "../shared/types";

export const FUEL_COST_CLASS = "fuel-cost-inline";

export interface ParsedDistance {
  distanceKm: number;
  raw: string;
}

const DISTANCE_PATTERN =
  /(^|\s)(?<value>\d+(?:(?:[.,]\d+)+)?)\s*(?<unit>km|kilometers?|mi|miles?)($|\s)/i;
const CAR_MODE_ICON_PATTERN = /\ue531/;
const NON_CAR_MODE_ICON_PATTERN = /[\ue52f\ue536]/;
const SELECTED_MODE_SELECTOR =
  '[aria-checked="true"], [aria-pressed="true"], [aria-selected="true"], [data-selected="true"]';
const ROUTE_SECTION_SELECTOR = [
  "[aria-label]",
  '[role="listitem"]',
  '[role="button"]'
].join(", ");

export function parseDistanceText(text: string): ParsedDistance | null {
  const cleaned = text.replace(/\u00a0/g, " ").trim();
  const match = cleaned.match(DISTANCE_PATTERN);
  if (!match?.groups) return null;

  const value = parseDistanceValue(match.groups.value);
  if (!Number.isFinite(value) || value <= 0) return null;

  const unit = match.groups.unit.toLowerCase();
  return {
    raw: match[0].trim(),
    distanceKm: unit.startsWith("mi") ? value * 1.609344 : value
  };
}

function parseDistanceValue(value: string): number {
  if (value.includes(",")) {
    return Number(value.replace(/\./g, "").replace(",", "."));
  }

  if (/^\d{1,3}(?:\.\d{3})+$/.test(value)) {
    return Number(value.replace(/\./g, ""));
  }

  return Number(value);
}

export function findDistanceElements(root: ParentNode = document): HTMLElement[] {
  const elements = Array.from(root.querySelectorAll<HTMLElement>("div, span"));

  return elements.filter((element) => {
    if (element.closest(`.${FUEL_COST_CLASS}`)) return false;

    const ownText = getOwnText(element);
    const candidateText = ownText || element.textContent || "";
    if (!parseDistanceText(candidateText)) return false;
    if (!isCarRouteDistanceElement(element, root)) {
      removeAnnotation(element);
      return false;
    }
    if (element.matches('[aria-hidden="true"]')) return false;
    if (!isVisible(element)) return false;

    return !Array.from(element.children).some((child) =>
      parseDistanceText(child.textContent || "")
    );
  });
}

export function annotateDistanceElement(
  element: HTMLElement,
  settings: UserSettings,
  price: PriceQuote | undefined
) {
  if (!isCarRouteDistanceElement(element)) {
    removeAnnotation(element);
    return;
  }

  const distance = parseDistanceText(getOwnText(element) || element.textContent || "");
  if (!distance) return;

  const annotation = getOrCreateAnnotation(element);
  if (!price?.available || price.pricePerLiter === undefined) {
    annotation.textContent = "(price unavailable)";
    annotation.dataset.state = "unavailable";
    return;
  }

  const liters = litersForDistance(distance.distanceKm, settings.economy);
  const cost = round(liters * price.pricePerLiter, 2);
  const details = [formatCurrency(cost, price.currency || settings.currency)];

  if (settings.showFuelLiters) details.push(formatLiters(liters));

  if (settings.showRefuelsNeeded) {
    const refuels = refuelsForDistance(
      distance.distanceKm,
      settings.economy,
      settings.tankCapacityLiters,
      settings.rangeKm
    );
    if (refuels > 0) details.push(`${refuels} ${refuels === 1 ? "refuel" : "refuels"}`);
  }

  annotation.textContent = `(${details.join(" · ")})`;
  annotation.dataset.state = "ready";
}

export function removeAnnotations(root: ParentNode = document) {
  root.querySelectorAll(`.${FUEL_COST_CLASS}`).forEach((element) => element.remove());
}

export function isCarRouteDistanceElement(
  element: HTMLElement,
  root: ParentNode = document
): boolean {
  const selectedMode = findSelectedTravelMode(root);
  if (selectedMode === "non-car") return false;

  const sectionMode = findRouteSectionMode(element);
  if (sectionMode === "non-car") return false;

  return selectedMode === "car" || sectionMode === "car" || selectedMode === undefined;
}

function getOrCreateAnnotation(element: HTMLElement): HTMLSpanElement {
  const existing = element.querySelector<HTMLSpanElement>(`:scope > .${FUEL_COST_CLASS}`);
  if (existing) return existing;

  const annotation = document.createElement("span");
  annotation.className = FUEL_COST_CLASS;
  element.append(document.createTextNode(" "));
  element.append(annotation);
  return annotation;
}

function removeAnnotation(element: HTMLElement) {
  element.querySelector(`:scope > .${FUEL_COST_CLASS}`)?.remove();
}

function findSelectedTravelMode(root: ParentNode): "car" | "non-car" | undefined {
  if (!(root instanceof Document || root instanceof Element)) return undefined;

  for (const element of Array.from(root.querySelectorAll<HTMLElement>(SELECTED_MODE_SELECTOR))) {
    const mode = getModeFromElement(element);
    if (mode) return mode;
  }

  return undefined;
}

function findRouteSectionMode(element: HTMLElement): "car" | "non-car" | undefined {
  for (const ancestor of getAncestors(element)) {
    const mode = getModeFromElement(ancestor);
    if (mode) return mode;

    for (const section of Array.from(ancestor.querySelectorAll<HTMLElement>(ROUTE_SECTION_SELECTOR))) {
      if (section === element || section.contains(element)) continue;

      const nestedMode = getModeFromElement(section);
      if (nestedMode) return nestedMode;
    }
  }

  return undefined;
}

function getModeFromElement(element: HTMLElement): "car" | "non-car" | undefined {
  const iconText = getGoogleSymbolsText(element);
  if (NON_CAR_MODE_ICON_PATTERN.test(iconText)) return "non-car";
  if (CAR_MODE_ICON_PATTERN.test(iconText)) return "car";

  return undefined;
}

function getGoogleSymbolsText(element: HTMLElement): string {
  const icons = [
    ...(element.matches(".google-symbols") ? [element] : []),
    ...Array.from(element.querySelectorAll<HTMLElement>(".google-symbols"))
  ];

  return icons
    .map((icon) => icon.textContent || "")
    .join("");
}

function getAncestors(element: HTMLElement): HTMLElement[] {
  const ancestors: HTMLElement[] = [];
  let current: HTMLElement | null = element;

  while (current && ancestors.length < 8) {
    if (current === document.body || current === document.documentElement) break;
    ancestors.push(current);
    current = current.parentElement;
  }

  return ancestors;
}

function getOwnText(element: HTMLElement): string {
  return Array.from(element.childNodes)
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => node.textContent || "")
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function isVisible(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    style.visibility !== "hidden" &&
    style.display !== "none"
  );
}

function formatCurrency(value: number, currency: string): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 2
  }).format(value);
}

function formatLiters(value: number): string {
  return `${new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 1,
    minimumFractionDigits: value < 10 ? 1 : 0
  }).format(value)} L`;
}
