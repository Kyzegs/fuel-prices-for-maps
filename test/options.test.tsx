import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Options } from "../entrypoints/options/main";
import { getSettings } from "../src/shared/settings";

describe("options settings UX", () => {
  it("explicitly saves currency edits without exposing API URL settings", async () => {
    render(<Options />);

    expect(screen.queryByLabelText("Backend API URL")).not.toBeInTheDocument();

    const currencyInput = (await screen.findAllByLabelText("Currency"))[0] as HTMLSelectElement;
    expect(currencyInput.tagName).toBe("SELECT");
    expect(screen.getByRole("option", { name: "EUR" })).toBeInTheDocument();

    fireEvent.change(currencyInput, { target: { value: "EUR" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.getByText("Saved")).toBeInTheDocument());
  });

  it("saves display detail toggles without general tank or range fields", async () => {
    render(<Options />);

    const litersToggle = await screen.findByLabelText("Show liters");
    const refuelsToggle = screen.getByLabelText("Show refuels needed");
    expect(litersToggle).not.toBeChecked();
    expect(refuelsToggle).not.toBeChecked();
    expect(screen.queryByLabelText("Tank capacity")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Range")).not.toBeInTheDocument();

    fireEvent.click(litersToggle);
    fireEvent.click(refuelsToggle);

    await waitFor(async () =>
      expect(await getSettings()).toMatchObject({
        showFuelLiters: true,
        showRefuelsNeeded: true
      })
    );
  });
});
