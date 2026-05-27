import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import browser from "webextension-polyfill";
import { CarFront, Fuel, RefreshCw, Route, Settings, Trash2 } from "lucide-react";
import { lookupVehicle } from "../../src/shared/api";
import { getDailyPrice } from "../../src/shared/priceCache";
import { DEFAULT_SETTINGS } from "../../src/shared/settings";
import { useSettingsState } from "../../src/shared/useSettingsState";
import {
  FUEL_LABELS,
  SUPPORTED_PLATE_COUNTRIES,
  SUPPORTED_PRICE_FUEL_TYPES,
  SUPPORTED_PRICE_COUNTRIES,
  type EconomyUnit,
  type PriceQuote,
  type SavedVehicle,
  type UserSettings
} from "../../src/shared/types";
import "./style.css";

export function Popup() {
  const { settings, isLoading, status, setStatus, persist } = useSettingsState();
  const [economyValue, setEconomyValue] = useState(String(DEFAULT_SETTINGS.economy.value));
  const [prices, setPrices] = useState<PriceQuote[]>([]);
  const [priceStatus, setPriceStatus] = useState("Loading prices");
  const [plate, setPlate] = useState("");

  useEffect(() => {
    if (isLoading) return;
    setEconomyValue(String(settings.economy.value));
    setPlate(settings.savedVehicles.find((vehicle) => vehicle.id === settings.selectedVehicleId)?.plate || "");
  }, [isLoading, settings.economy.value, settings.savedVehicles, settings.selectedVehicleId]);

  useEffect(() => {
    if (isLoading) return;
    void loadPrices(settings);
  }, [isLoading]);

  const canLookup = useMemo(() => plate.trim().length >= 4, [plate]);
  const selectedPrice = prices[0]?.fuel === settings.fuelType ? prices[0] : undefined;
  const selectedVehicle = settings.savedVehicles.find(
    (vehicle) => vehicle.id === settings.selectedVehicleId
  );

  async function persistAndRefresh(next: UserSettings, message = "Saved") {
    await persist(next, message);
    void loadPrices(next);
  }

  async function loadPrices(currentSettings = settings, refresh = false) {
    setPriceStatus("Loading prices");
    try {
      const basePrice = await getDailyPrice(
        currentSettings.country,
        currentSettings.fuelType,
        { refresh }
      );
      setPrices(basePrice ? [basePrice] : []);
      setPriceStatus(formatPriceStatus(basePrice, currentSettings.country));
    } catch (error) {
      setPrices([]);
      setPriceStatus(error instanceof Error ? error.message : "Price fetch failed");
    }
  }

  async function onLookup() {
    if (!canLookup) return;
    setStatus("Looking up vehicle");
    try {
      const response = await lookupVehicle(
        settings.plateCountry,
        plate.trim()
      );
      if (response.economy) {
        const country = settings.plateCountry.toUpperCase();
        const normalizedPlate = normalizePlate(response.plate || plate);
        const vehicle: SavedVehicle = {
          id: makeVehicleId(country, normalizedPlate),
          country,
          plate: normalizedPlate,
          model: response.model,
          economy: response.economy
        };
        const savedVehicles = [
          ...settings.savedVehicles.filter((item) => item.id !== vehicle.id),
          vehicle
        ];

        setEconomyValue(String(response.economy.value));
        setPlate(vehicle.plate);
        await persistAndRefresh({
          ...settings,
          economy: response.economy,
          savedVehicles,
          selectedVehicleId: vehicle.id
        }, response.model ? `Loaded ${response.model}` : "Economy loaded");
        setStatus(response.model ? `Loaded ${response.model}` : "Economy loaded");
      } else {
        setStatus(response.message || "Manual economy required");
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Lookup failed");
    }
  }

  function updateEconomyValue(nextValue: string) {
    setEconomyValue(nextValue);

    const numericValue = Number(nextValue);
    if (nextValue.trim() === "" || !Number.isFinite(numericValue) || numericValue <= 0) {
      setStatus("Enter a valid fuel economy");
      return;
    }

    if (numericValue === settings.economy.value && !settings.selectedVehicleId) return;

    void persist({
      ...settings,
      economy: { ...settings.economy, value: numericValue },
      selectedVehicleId: undefined
    });
  }

  function selectVehicle(vehicle: SavedVehicle) {
    setEconomyValue(String(vehicle.economy.value));
    setPlate(vehicle.plate);
    void persist({
      ...settings,
      economy: vehicle.economy,
      plateCountry: vehicle.country,
      selectedVehicleId: vehicle.id
    }, vehicle.model ? `Selected ${vehicle.model}` : `Selected ${vehicle.plate}`);
  }

  function removeVehicle(vehicleId: string) {
    void persist({
      ...settings,
      savedVehicles: settings.savedVehicles.filter((vehicle) => vehicle.id !== vehicleId),
      selectedVehicleId: settings.selectedVehicleId === vehicleId ? undefined : settings.selectedVehicleId
    }, "Plate removed");
  }

  async function openOptions() {
    await browser.runtime.openOptionsPage();
  }

  return (
    <main className="app-shell">
      <header className="hero">
        <div>
          <span className="mark">
            <Fuel size={18} />
          </span>
          <h1>Fuel Cost</h1>
          <p>Google Maps trip estimates with selected-country fuel prices.</p>
        </div>
      </header>

      <button className="secondary-action" type="button" onClick={openOptions}>
        <Settings size={16} />
        Manage settings
      </button>

      <section className="panel">
        <div className="section-title row-between">
          <span className="title-with-icon">
            <Fuel size={17} />
            <h2>Average fuel prices</h2>
          </span>
          <button
            className="icon-button"
            aria-label="Refresh prices"
            disabled={isLoading || priceStatus === "Loading prices"}
            onClick={() => loadPrices(settings, true)}
          >
            <RefreshCw size={15} />
          </button>
        </div>
        <div className="price-hero">
          <span>{FUEL_LABELS[settings.fuelType]}</span>
          <strong>{formatPrice(selectedPrice)}</strong>
        </div>
        <p className="muted">{priceStatus}</p>
      </section>

      <section className="panel">
        <label>
          <span>Country</span>
          <select
            value={settings.country}
            onChange={(event) => {
              const country = SUPPORTED_PRICE_COUNTRIES.find(
                (item) => item.code === event.target.value
              );
              void persistAndRefresh({
                ...settings,
                country: event.target.value,
                currency: country?.currency || settings.currency
              });
            }}
          >
            {SUPPORTED_PRICE_COUNTRIES.map((country) => (
              <option key={country.code} value={country.code}>
                {country.label} ({country.code})
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Fuel type</span>
          <select
            value={settings.fuelType}
            onChange={(event) =>
              persistAndRefresh({ ...settings, fuelType: event.target.value as UserSettings["fuelType"] })
            }
          >
            {SUPPORTED_PRICE_FUEL_TYPES.map((fuel) => (
              <option key={fuel} value={fuel}>
                {FUEL_LABELS[fuel]}
              </option>
            ))}
          </select>
        </label>

        <div className="split">
          <label>
            <span>Economy</span>
            <input
              inputMode="decimal"
              min="0.1"
              step="0.1"
              type="number"
              value={economyValue}
              onChange={(event) => updateEconomyValue(event.target.value)}
            />
          </label>
          <label>
            <span>Unit</span>
            <select
              value={settings.economy.unit}
              onChange={(event) =>
                persist({
                  ...settings,
                  economy: { ...settings.economy, unit: event.target.value as EconomyUnit },
                  selectedVehicleId: undefined
                })
              }
            >
              <option value="l_per_100km">L/100 km</option>
              <option value="km_per_l">km/L</option>
              <option value="mpg_us">MPG US</option>
              <option value="mpg_imp">MPG UK</option>
            </select>
          </label>
        </div>
      </section>

      <section className="panel">
        <div className="section-title">
          <CarFront size={17} />
          <h2>Vehicle lookup</h2>
        </div>
        {selectedVehicle ? (
          <p className="muted">Using {selectedVehicle.plate}</p>
        ) : (
          <p className="muted">Manual fuel economy</p>
        )}
        <div className="split country-plate">
          <label>
            <span>Country</span>
            <select
              value={settings.plateCountry}
              onChange={(event) =>
                persistAndRefresh({ ...settings, plateCountry: event.target.value.toUpperCase() })
              }
            >
              {SUPPORTED_PLATE_COUNTRIES.map((country) => (
                <option key={country.code} value={country.code}>
                  {country.label} ({country.code})
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Plate</span>
            <input value={plate} onChange={(event) => setPlate(event.target.value)} />
          </label>
        </div>
        <button className="primary" disabled={!canLookup} onClick={onLookup}>
          <Route size={16} />
          Fetch economy
        </button>
        {settings.savedVehicles.length > 0 ? (
          <ul className="vehicle-list">
            {settings.savedVehicles.map((vehicle) => (
              <li key={vehicle.id} data-selected={vehicle.id === settings.selectedVehicleId}>
                <button
                  className="vehicle-select"
                  type="button"
                  aria-pressed={vehicle.id === settings.selectedVehicleId}
                  onClick={() => selectVehicle(vehicle)}
                >
                  <strong>{vehicle.plate}</strong>
                  <span>
                    {vehicle.model || vehicle.country} · {formatEconomy(vehicle.economy)}
                  </span>
                </button>
                <button
                  className="icon-button danger"
                  type="button"
                  aria-label={`Remove ${vehicle.plate}`}
                  onClick={() => removeVehicle(vehicle.id)}
                >
                  <Trash2 size={15} />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <footer>
        <span>{status}</span>
        <span className="issue-note">
          Issues? Open them on{" "}
          <a
            href="https://github.com/Kyzegs/fuel-prices-for-maps/issues"
            rel="noreferrer"
            target="_blank"
          >
            GitHub
          </a>
          .
        </span>
      </footer>
    </main>
  );
}

const root = document.getElementById("root");
if (root) createRoot(root).render(<Popup />);

function formatPrice(price: PriceQuote | undefined): string {
  if (!price?.available || price.pricePerLiter === undefined) return "Unavailable";

  return `${new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: price.currency,
    maximumFractionDigits: 2
  }).format(price.pricePerLiter)}/L`;
}

function formatPriceStatus(price: PriceQuote | undefined, country: string): string {
  if (!price) return "Price unavailable";
  if (!price.available) return price.diagnostics?.message || "Price unavailable";
  return price.diagnostics?.message || `Daily average for ${country}`;
}

function formatEconomy(economy: SavedVehicle["economy"]): string {
  const unitLabels: Record<EconomyUnit, string> = {
    l_per_100km: "L/100 km",
    km_per_l: "km/L",
    mpg_us: "MPG US",
    mpg_imp: "MPG UK"
  };

  return `${economy.value} ${unitLabels[economy.unit]}`;
}

function normalizePlate(plate: string): string {
  return plate.replace(/[^a-z0-9]/gi, "").toUpperCase();
}

function makeVehicleId(country: string, plate: string): string {
  return `${country}:${plate}`;
}
