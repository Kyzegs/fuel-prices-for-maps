import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Popup } from "../entrypoints/popup/main";

describe("popup settings UX", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps economy edits as a draft until Save economy is clicked", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          prices: [
            {
              country: "NL",
              fuel: "gasoline_95",
              available: true,
              pricePerLiter: 2,
              currency: "EUR",
              source: "provider"
            }
          ]
        }),
        { status: 200 }
      )
    );

    render(<Popup />);

    const economyInput = await screen.findByLabelText("Economy");
    fireEvent.change(economyInput, { target: { value: "" } });
    fireEvent.change(economyInput, { target: { value: "7.1" } });

    expect(screen.getByText("Ready")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save economy" }));

    await waitFor(() => expect(screen.getByText("Saved")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalled();
  });
});
