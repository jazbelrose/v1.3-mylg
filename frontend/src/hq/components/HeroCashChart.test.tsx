import React from "react";
import { render, waitFor } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const addSeriesMock = vi.fn();
const priceScaleApplyOptionsMock = vi.fn();
const priceScaleMock = vi.fn(() => ({ applyOptions: priceScaleApplyOptionsMock }));

vi.mock("lightweight-charts", () => {
  return {
    AreaSeries: "AreaSeries",
    HistogramSeries: "HistogramSeries",
    ColorType: { Solid: "Solid" },
    CrosshairMode: { Normal: "Normal" },
    createChart: vi.fn(() => {
      const chart = {
        addSeries: addSeriesMock.mockImplementation(() => ({
          setData: vi.fn(),
          applyOptions: vi.fn(),
        })),
        applyOptions: vi.fn(),
        subscribeCrosshairMove: vi.fn(),
        unsubscribeCrosshairMove: vi.fn(),
        remove: vi.fn(),
        timeScale: vi.fn(() => ({ fitContent: vi.fn() })),
        priceScale: priceScaleMock,
      };
      return chart;
    }),
  };
});

import HeroCashChart from "@/hq/components/HeroCashChart";

beforeAll(() => {
  class MockResizeObserver {
    private cb: ResizeObserverCallback;
    constructor(cb: ResizeObserverCallback) {
      this.cb = cb;
    }
    observe() {
      this.cb([{ contentRect: { width: 800, height: 320 } } as ResizeObserverEntry], this as unknown as ResizeObserver);
    }
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", MockResizeObserver as unknown as typeof ResizeObserver);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe("HeroCashChart", () => {
  it("renders inflow/outflow on a separate price scale", async () => {
    render(
      <HeroCashChart
        range="1M"
        visibleSeries={{ balance: true, inflow: true, outflow: true }}
        balance={[{ time: "2026-01-23", value: 10000 }]}
        inflow={[{ time: "2026-01-23", value: 0 }]}
        outflow={[{ time: "2026-01-23", value: 70 }]}
      />
    );

    await waitFor(() => expect(addSeriesMock).toHaveBeenCalled());

    const histogramCalls = addSeriesMock.mock.calls.filter((call) => call[0] === "HistogramSeries");
    expect(histogramCalls).toHaveLength(2);
    for (const call of histogramCalls) {
      expect(call[1]).toMatchObject({ priceScaleId: "volume" });
    }

    expect(priceScaleMock).toHaveBeenCalledWith("volume");
    expect(priceScaleApplyOptionsMock).toHaveBeenCalled();
  });
});

