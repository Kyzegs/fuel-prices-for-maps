import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Options } from "../entrypoints/options/main";

describe("options settings UX", () => {
  it("explicitly saves currency edits without exposing API URL settings", async () => {
    render(<Options />);

    expect(screen.queryByLabelText("Backend API URL")).not.toBeInTheDocument();

    const currencyInput = (await screen.findAllByLabelText("Currency"))[0];
    fireEvent.change(currencyInput, { target: { value: "EU" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByText("Enter a 3-letter currency code")).toBeInTheDocument();

    fireEvent.change(currencyInput, { target: { value: "EUR" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.getByText("Saved")).toBeInTheDocument());
  });
});
