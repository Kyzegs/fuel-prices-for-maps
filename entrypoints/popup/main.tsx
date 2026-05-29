import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import browser from "webextension-polyfill";
import {
  CarFront,
  ChevronDown,
  Fuel,
  Plus,
  RefreshCw,
  Route,
  Settings,
  Trash2
} from "lucide-react";
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

interface PendingVehicleLookup {
  country: string;
  plate: string;
  model?: string;
  fuelType?: UserSettings["fuelType"];
}

type VehicleAccordionPanel = "lookup" | "manual";
type StatusTone = "info" | "success" | "error";

export function Popup() {
  const { settings, isLoading, status, setStatus, persist } = useSettingsState();
  const [economyValue, setEconomyValue] = useState(String(DEFAULT_SETTINGS.economy.value));
  const [prices, setPrices] = useState<PriceQuote[]>([]);
  const [priceStatus, setPriceStatus] = useState("Loading prices");
  const [plate, setPlate] = useState("");
  const [pendingLookup, setPendingLookup] = useState<PendingVehicleLookup | undefined>();
  const [openVehiclePanel, setOpenVehiclePanel] = useState<VehicleAccordionPanel>("lookup");
  const [economyStatus, setEconomyStatus] = useState("");
  const [vehicleStatus, setVehicleStatus] = useState("");
  const [vehicleStatusTone, setVehicleStatusTone] = useState<StatusTone>("info");
  const [manualNickname, setManualNickname] = useState("");
  const [manualPlate, setManualPlate] = useState("");
  const [manualFuelType, setManualFuelType] = useState<UserSettings["fuelType"]>(
    DEFAULT_SETTINGS.fuelType
  );
  const [manualEconomy, setManualEconomy] = useState("");
  const [manualTankCapacity, setManualTankCapacity] = useState("");
  const [manualRange, setManualRange] = useState("");

  useEffect(() => {
    if (isLoading) return;
    setEconomyValue(String(settings.economy.value));
    setPlate(settings.savedVehicles.find((vehicle) => vehicle.id === settings.selectedVehicleId)?.plate || "");
  }, [isLoading, settings.economy.value, settings.savedVehicles, settings.selectedVehicleId]);

  useEffect(() => {
    if (isLoading || pendingLookup) return;
    setManualFuelType(settings.fuelType);
  }, [isLoading, pendingLookup, settings.fuelType]);

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
    if (!canLookup) {
      setVehicleStatusTone("error");
      setVehicleStatus("Enter at least 4 plate characters.");
      return;
    }
    setStatus("Looking up vehicle");
    setVehicleStatusTone("info");
    setVehicleStatus("Looking up vehicle");
    try {
      const response = await lookupVehicle(settings.plateCountry, plate.trim());
      if (response.economy) {
        const country = settings.plateCountry.toUpperCase();
        const normalizedPlate = normalizePlate(response.plate || plate);
        const existingVehicle = settings.savedVehicles.find(
          (item) => item.id === makeVehicleId(country, normalizedPlate)
        );
        const vehicle: SavedVehicle = {
          id: makeVehicleId(country, normalizedPlate),
          country,
          plate: normalizedPlate,
          nickname: existingVehicle?.nickname?.trim() || response.model,
          model: response.model,
          fuelType: response.fuelType ?? existingVehicle?.fuelType ?? settings.fuelType,
          economy: response.economy,
          refuelMode: response.rangeKm ? "range" : "tank",
          tankCapacityLiters: response.tankCapacityLiters ?? null,
          rangeKm: response.rangeKm ?? null
        };
        const savedVehicles = [
          ...settings.savedVehicles.filter((item) => item.id !== vehicle.id),
          vehicle
        ];

        setEconomyValue(String(response.economy.value));
        setPlate(vehicle.plate);
        await persistAndRefresh({
          ...settings,
          fuelType: vehicle.fuelType ?? settings.fuelType,
          economy: response.economy,
          tankCapacityLiters: activeTankCapacity(vehicle),
          rangeKm: activeRange(vehicle),
          savedVehicles,
          selectedVehicleId: vehicle.id
        });
        setVehicleStatusTone("success");
        setVehicleStatus(response.model ? `Loaded ${response.model}` : "Economy loaded");
        setPendingLookup(undefined);
      } else {
        const country = response.country.toUpperCase();
        const normalizedPlate = normalizePlate(response.plate || plate);
        if (normalizedPlate && (response.model || response.fuelType)) {
          setPendingLookup({
            country,
            plate: normalizedPlate,
            model: response.model,
            fuelType: response.fuelType
          });
          setPlate(normalizedPlate);
          setManualNickname(response.model ?? "");
          setManualPlate(normalizedPlate);
          setManualFuelType(response.fuelType ?? settings.fuelType);
          setManualEconomy("");
          setManualTankCapacity("");
          setManualRange("");
          setOpenVehiclePanel("manual");
        } else {
          setPendingLookup(undefined);
        }
        const message = response.message || "Manual economy required";
        setStatus("Ready");
        setVehicleStatusTone("info");
        setVehicleStatus(message);
      }
    } catch (error) {
      setPendingLookup(undefined);
      const message = error instanceof Error ? error.message : "Lookup failed";
      setStatus("Ready");
      setVehicleStatusTone("error");
      setVehicleStatus(message);
    }
  }

  function addManualVehicle() {
    const nickname = manualNickname.trim();
    const economy = Number(manualEconomy);
    const tankCapacityLiters = numberOrNull(manualTankCapacity);
    const rangeKm = numberOrNull(manualRange);

    if (!nickname) {
      setVehicleStatusTone("error");
      setVehicleStatus("Enter a vehicle nickname");
      return;
    }

    if (!Number.isFinite(economy) || economy <= 0) {
      setVehicleStatusTone("error");
      setVehicleStatus("Enter a valid fuel economy");
      return;
    }

    const country = pendingLookup?.country ?? settings.plateCountry.toUpperCase();
    const rawPlate = manualPlate.trim();
    const normalizedPendingPlate = pendingLookup ? normalizePlate(rawPlate || pendingLookup.plate) : rawPlate;
    const vehicle: SavedVehicle = {
      id: pendingLookup && normalizedPendingPlate
        ? makeVehicleId(country, normalizedPendingPlate)
        : makeManualVehicleId(),
      country,
      plate: normalizedPendingPlate,
      nickname,
      model: pendingLookup?.model,
      fuelType: pendingLookup?.fuelType ?? manualFuelType,
      economy: {
        ...settings.economy,
        value: economy
      },
      refuelMode: rangeKm ? "range" : "tank",
      tankCapacityLiters,
      rangeKm
    };

    setEconomyValue(String(economy));
    setPlate(vehicle.plate);
    setManualNickname("");
    setManualPlate("");
    setManualFuelType(settings.fuelType);
    setManualEconomy("");
    setManualTankCapacity("");
    setManualRange("");
    setPendingLookup(undefined);
    setVehicleStatusTone("success");
    setVehicleStatus(`Added ${vehicleDisplayName(vehicle)}`);
    void persistAndRefresh({
      ...settings,
      fuelType: vehicle.fuelType ?? settings.fuelType,
      economy: vehicle.economy,
      tankCapacityLiters: activeTankCapacity(vehicle),
      rangeKm: activeRange(vehicle),
      plateCountry: vehicle.country,
      savedVehicles: [
        ...settings.savedVehicles.filter((item) => item.id !== vehicle.id),
        vehicle
      ],
      selectedVehicleId: vehicle.id
    });
  }

  function updateEconomyValue(nextValue: string) {
    setEconomyValue(nextValue);

    const numericValue = Number(nextValue);
    if (nextValue.trim() === "" || !Number.isFinite(numericValue) || numericValue <= 0) {
      setEconomyStatus("Enter a valid fuel economy");
      return;
    }
    setEconomyStatus("");

    if (numericValue === settings.economy.value && !settings.selectedVehicleId) return;

    void persist({
      ...settings,
      economy: { ...settings.economy, value: numericValue },
      tankCapacityLiters: null,
      rangeKm: null,
      selectedVehicleId: undefined
    });
  }

  function selectVehicle(vehicle: SavedVehicle) {
    setEconomyValue(String(vehicle.economy.value));
    setPlate(vehicle.plate);
    void persistAndRefresh({
      ...settings,
      fuelType: vehicle.fuelType ?? settings.fuelType,
      economy: vehicle.economy,
      tankCapacityLiters: activeTankCapacity(vehicle),
      rangeKm: activeRange(vehicle),
      plateCountry: vehicle.country,
      selectedVehicleId: vehicle.id
    }, `Selected ${vehicleDisplayName(vehicle)}`);
  }

  function updateVehicle(vehicle: SavedVehicle, patch: Partial<SavedVehicle>) {
    const isSelectedVehicle = settings.selectedVehicleId === vehicle.id;
    const nextVehicle = { ...vehicle, ...patch };
    const nextSettings = {
      ...settings,
      fuelType: isSelectedVehicle ? nextVehicle.fuelType ?? settings.fuelType : settings.fuelType,
      economy: isSelectedVehicle ? nextVehicle.economy : settings.economy,
      tankCapacityLiters: isSelectedVehicle
        ? activeTankCapacity(nextVehicle)
        : settings.tankCapacityLiters,
      rangeKm: isSelectedVehicle
        ? activeRange(nextVehicle)
        : settings.rangeKm,
      savedVehicles: settings.savedVehicles.map((item) =>
        item.id === vehicle.id ? nextVehicle : item
      )
    };

    if (isSelectedVehicle && patch.fuelType && patch.fuelType !== settings.fuelType) {
      void persistAndRefresh(nextSettings);
      return;
    }

    void persist(nextSettings);
  }

  function updateVehicleEconomy(vehicle: SavedVehicle, nextValue: string) {
    const value = Number(nextValue);
    if (!Number.isFinite(value) || value <= 0) return;
    updateVehicle(vehicle, {
      economy: {
        ...vehicle.economy,
        value
      }
    });
  }

  function updateVehicleFuelType(vehicle: SavedVehicle, fuelType: UserSettings["fuelType"]) {
    updateVehicle(vehicle, { fuelType });
  }

  function updateVehicleNickname(vehicle: SavedVehicle, nickname: string) {
    updateVehicle(vehicle, { nickname });
  }

  function updateVehiclePlate(vehicle: SavedVehicle, plate: string) {
    updateVehicle(vehicle, { plate });
  }

  function updateVehicleTankCapacity(vehicle: SavedVehicle, nextValue: string) {
    if (nextValue.trim() === "") {
      updateVehicle(vehicle, { tankCapacityLiters: null });
      return;
    }
    const tankCapacityLiters = Number(nextValue);
    if (!Number.isFinite(tankCapacityLiters) || tankCapacityLiters <= 0) return;
    updateVehicle(vehicle, { tankCapacityLiters });
  }

  function updateVehicleRefuelMode(vehicle: SavedVehicle, refuelMode: NonNullable<SavedVehicle["refuelMode"]>) {
    updateVehicle(vehicle, { refuelMode });
  }

  function updateVehicleRange(vehicle: SavedVehicle, nextValue: string) {
    if (nextValue.trim() === "") {
      updateVehicle(vehicle, { rangeKm: null });
      return;
    }
    const rangeKm = Number(nextValue);
    updateVehicle(vehicle, {
      rangeKm: Number.isFinite(rangeKm) && rangeKm > 0 ? rangeKm : null
    });
  }

  function removeVehicle(vehicleId: string) {
    const isSelectedVehicle = settings.selectedVehicleId === vehicleId;
    void persist({
      ...settings,
      savedVehicles: settings.savedVehicles.filter((vehicle) => vehicle.id !== vehicleId),
      tankCapacityLiters: isSelectedVehicle ? null : settings.tankCapacityLiters,
      rangeKm: isSelectedVehicle ? null : settings.rangeKm,
      selectedVehicleId: isSelectedVehicle ? undefined : settings.selectedVehicleId
    }, "Vehicle removed");
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
              persistAndRefresh({
                ...settings,
                fuelType: event.target.value as UserSettings["fuelType"],
                selectedVehicleId: undefined
              })
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
            <span>Economy ({formatEconomyUnit(settings.economy.unit)})</span>
            <input
              aria-label="Trip economy"
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
                  tankCapacityLiters: null,
                  rangeKm: null,
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
        {economyStatus ? (
          <p className="inline-status error" role="status">{economyStatus}</p>
        ) : null}
      </section>

      <section className="panel">
        <div className="section-title">
          <CarFront size={17} />
          <h2>Vehicles</h2>
        </div>
        {selectedVehicle ? (
          <p className="muted">Using {vehicleDisplayName(selectedVehicle)}</p>
        ) : (
          <p className="muted">Manual fuel economy</p>
        )}
        <div className="vehicle-accordion">
          <button
            aria-controls="vehicle-lookup-panel"
            aria-expanded={openVehiclePanel === "lookup"}
            className="accordion-trigger"
            type="button"
            onClick={() => {
              setOpenVehiclePanel("lookup");
              setVehicleStatus("");
              setVehicleStatusTone("info");
            }}
          >
            <span className="title-with-icon">
              <Route size={15} />
              Vehicle lookup
            </span>
            <ChevronDown size={15} />
          </button>
          {openVehiclePanel === "lookup" ? (
            <div className="accordion-panel" id="vehicle-lookup-panel">
              {vehicleStatus ? (
                <p className={`inline-status ${vehicleStatusTone}`} role="status">{vehicleStatus}</p>
              ) : null}
              <div className="split country-plate">
                <label>
                  <span>Country</span>
                  <select
                    value={settings.plateCountry}
                    onChange={(event) => {
                      setPendingLookup(undefined);
                      void persistAndRefresh({
                        ...settings,
                        plateCountry: event.target.value.toUpperCase()
                      });
                      setVehicleStatus("");
                      setVehicleStatusTone("info");
                    }}
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
                  <input
                    value={plate}
                    onChange={(event) => {
                      setPendingLookup(undefined);
                      setPlate(event.target.value);
                      setVehicleStatus("");
                      setVehicleStatusTone("info");
                    }}
                  />
                </label>
              </div>
              <button className="primary" type="button" onClick={onLookup}>
                <Route size={16} />
                Fetch economy
              </button>
            </div>
          ) : null}

          <button
            aria-controls="manual-vehicle-panel"
            aria-expanded={openVehiclePanel === "manual"}
            className="accordion-trigger"
            type="button"
            onClick={() => {
              setOpenVehiclePanel("manual");
              setVehicleStatus("");
              setVehicleStatusTone("info");
            }}
          >
            <span className="title-with-icon">
              <Plus size={15} />
              Add vehicle manually
            </span>
            <ChevronDown size={15} />
          </button>
          {openVehiclePanel === "manual" ? (
            <div className="accordion-panel manual-vehicle-form" id="manual-vehicle-panel">
              {vehicleStatus ? (
                <p className={`inline-status ${vehicleStatusTone}`} role="status">{vehicleStatus}</p>
              ) : null}
              <div className="manual-vehicle-grid">
                <label>
                  <span>Nickname *</span>
                  <input
                    aria-label="Manual vehicle nickname"
                    value={manualNickname}
                    onChange={(event) => {
                      setManualNickname(event.target.value);
                      setVehicleStatus("");
                      setVehicleStatusTone("info");
                    }}
                  />
                </label>
                <label>
                  <span>Plate</span>
                  <input
                    aria-label="Manual vehicle plate"
                    value={manualPlate}
                    onChange={(event) => {
                      setManualPlate(event.target.value);
                      setVehicleStatus("");
                      setVehicleStatusTone("info");
                    }}
                  />
                </label>
                <label>
                  <span>Fuel type</span>
                  <select
                    aria-label="Manual vehicle fuel type"
                    value={manualFuelType}
                    onChange={(event) =>
                      setManualFuelType(event.target.value as UserSettings["fuelType"])
                    }
                  >
                    {SUPPORTED_PRICE_FUEL_TYPES.map((fuel) => (
                      <option key={fuel} value={fuel}>
                        {FUEL_LABELS[fuel]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Economy ({formatEconomyUnit(settings.economy.unit)}) *</span>
                  <input
                    aria-label="Manual vehicle economy"
                    inputMode="decimal"
                    min="0.1"
                    step="0.1"
                    type="number"
                    value={manualEconomy}
                    onChange={(event) => {
                      setManualEconomy(event.target.value);
                      setVehicleStatus("");
                      setVehicleStatusTone("info");
                    }}
                  />
                </label>
                <label>
                  <span>Tank</span>
                  <input
                    aria-label="Manual vehicle tank capacity"
                    inputMode="decimal"
                    min="1"
                    step="0.1"
                    type="number"
                    value={manualTankCapacity}
                    onChange={(event) => {
                      setManualTankCapacity(event.target.value);
                      setVehicleStatus("");
                      setVehicleStatusTone("info");
                    }}
                  />
                </label>
                <label>
                  <span>Range</span>
                  <input
                    aria-label="Manual vehicle range"
                    inputMode="decimal"
                    min="1"
                    step="1"
                    type="number"
                    value={manualRange}
                    onChange={(event) => {
                      setManualRange(event.target.value);
                      setVehicleStatus("");
                      setVehicleStatusTone("info");
                    }}
                  />
                </label>
              </div>
              <button
                className="primary compact"
                type="button"
                onClick={addManualVehicle}
              >
                <Plus size={16} />
                Add vehicle
              </button>
            </div>
          ) : null}
        </div>
        {settings.savedVehicles.length > 0 ? (
          <ul className="vehicle-list">
            {settings.savedVehicles.map((vehicle) => {
              const vehicleName = vehicleDisplayName(vehicle);
              const vehiclePlate = vehicle.plate.trim();
              return (
                <li key={vehicle.id} data-selected={vehicle.id === settings.selectedVehicleId}>
                  <button
                    className="vehicle-select"
                    type="button"
                    aria-pressed={vehicle.id === settings.selectedVehicleId}
                    onClick={() => selectVehicle(vehicle)}
                  >
                    <strong>{vehicleName}</strong>
                    <span>
                      {vehiclePlate ? `${vehiclePlate} · ` : ""}
                      {FUEL_LABELS[vehicle.fuelType ?? settings.fuelType]} · {formatEconomy(vehicle.economy)}
                      {refuelModeFor(vehicle) === "range" && vehicle.rangeKm ? ` · ${formatRange(vehicle.rangeKm)}` : ""}
                      {refuelModeFor(vehicle) === "tank" && vehicle.tankCapacityLiters ? ` · ${formatTankCapacity(vehicle.tankCapacityLiters)}` : ""}
                    </span>
                  </button>
                  <button
                    className="icon-button danger"
                    type="button"
                    aria-label={`Remove ${vehicleName}`}
                    onClick={() => removeVehicle(vehicle.id)}
                  >
                    <Trash2 size={15} />
                  </button>
                  <div className="vehicle-fields">
                    <label>
                      <span>Nickname</span>
                      <input
                        aria-label={`Nickname for ${vehicleName}`}
                        value={vehicle.nickname ?? ""}
                        onChange={(event) => updateVehicleNickname(vehicle, event.target.value)}
                      />
                    </label>
                    <label>
                      <span>Plate</span>
                      <input
                        aria-label={`Plate for ${vehicleName}`}
                        value={vehicle.plate}
                        onChange={(event) => updateVehiclePlate(vehicle, event.target.value)}
                      />
                    </label>
                    <label>
                      <span>Fuel type</span>
                      <select
                        aria-label={`Fuel type for ${vehicleName}`}
                        value={vehicle.fuelType ?? settings.fuelType}
                        onChange={(event) =>
                          updateVehicleFuelType(
                            vehicle,
                            event.target.value as UserSettings["fuelType"]
                          )
                        }
                      >
                        {SUPPORTED_PRICE_FUEL_TYPES.map((fuel) => (
                          <option key={fuel} value={fuel}>
                            {FUEL_LABELS[fuel]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Economy ({formatEconomyUnit(vehicle.economy.unit)})</span>
                      <input
                        aria-label={`Economy for ${vehicleName}`}
                        inputMode="decimal"
                        min="0.1"
                        step="0.1"
                        type="number"
                        value={vehicle.economy.value}
                        onChange={(event) => updateVehicleEconomy(vehicle, event.target.value)}
                      />
                    </label>
                    <div className="vehicle-mode-field">
                      <span>Estimate by</span>
                      <div
                        aria-label={`Refuel estimate type for ${vehicleName}`}
                        className="vehicle-mode-toggle"
                        role="group"
                      >
                        <button
                          type="button"
                          aria-pressed={refuelModeFor(vehicle) === "tank"}
                          onClick={() => updateVehicleRefuelMode(vehicle, "tank")}
                        >
                          Tank
                        </button>
                        <button
                          type="button"
                          aria-pressed={refuelModeFor(vehicle) === "range"}
                          onClick={() => updateVehicleRefuelMode(vehicle, "range")}
                        >
                          Range
                        </button>
                      </div>
                    </div>
                    {refuelModeFor(vehicle) === "range" ? (
                      <label>
                        <span>Vehicle range</span>
                        <input
                          aria-label={`Range for ${vehicleName}`}
                          inputMode="decimal"
                          min="1"
                          step="1"
                          type="number"
                          value={vehicle.rangeKm ?? ""}
                          onChange={(event) => updateVehicleRange(vehicle, event.target.value)}
                        />
                      </label>
                    ) : (
                      <label>
                        <span>Vehicle tank</span>
                        <input
                          aria-label={`Tank capacity for ${vehicleName}`}
                          inputMode="decimal"
                          min="1"
                          step="0.1"
                          type="number"
                          value={vehicle.tankCapacityLiters ?? ""}
                          onChange={(event) => updateVehicleTankCapacity(vehicle, event.target.value)}
                        />
                      </label>
                    )}
                  </div>
                </li>
              );
            })}
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

function vehicleDisplayName(vehicle: SavedVehicle): string {
  return vehicle.nickname?.trim() || vehicle.plate.trim() || vehicle.model?.trim() || "Vehicle";
}

function formatEconomyUnit(unit: EconomyUnit): string {
  const unitLabels: Record<EconomyUnit, string> = {
    l_per_100km: "L/100 km",
    km_per_l: "km/L",
    mpg_us: "MPG US",
    mpg_imp: "MPG UK"
  };

  return unitLabels[unit];
}

function formatEconomy(economy: SavedVehicle["economy"]): string {
  return `${economy.value} ${formatEconomyUnit(economy.unit)}`;
}

function formatTankCapacity(tankCapacityLiters: number): string {
  return `${tankCapacityLiters} L tank`;
}

function formatRange(rangeKm: number): string {
  return `${rangeKm} km range`;
}

function activeTankCapacity(vehicle: SavedVehicle): number | null {
  return refuelModeFor(vehicle) === "tank" ? vehicle.tankCapacityLiters ?? null : null;
}

function activeRange(vehicle: SavedVehicle): number | null {
  return refuelModeFor(vehicle) === "range" ? vehicle.rangeKm ?? null : null;
}

function refuelModeFor(vehicle: SavedVehicle): NonNullable<SavedVehicle["refuelMode"]> {
  return vehicle.refuelMode ?? (vehicle.rangeKm ? "range" : "tank");
}

function normalizePlate(plate: string): string {
  return plate.replace(/[^a-z0-9]/gi, "").toUpperCase();
}

function makeVehicleId(country: string, plate: string): string {
  return `${country}:${plate}`;
}

function makeManualVehicleId(): string {
  const randomId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  return `manual:${randomId}`;
}

function numberOrNull(value: string): number | null {
  if (value.trim() === "") return null;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : null;
}
