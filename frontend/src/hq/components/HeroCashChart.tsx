import React from "react";
import {
  AreaSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
  type Time,
} from "lightweight-charts";
import type { HqChartSeriesRange } from "@/hq/lib/hqApi";
import styles from "./HeroCashChart.module.css";

export type DailyPoint = { time: string; value: number };

export type VisibleHeroCashSeries = {
  balance: boolean;
  inflow: boolean;
  outflow: boolean;
};

type TooltipModel = {
  visible: boolean;
  x: number;
  y: number;
  date: string;
  balance: number | null;
  inflow: number | null;
  outflow: number | null;
};

function timeToIso(time: Time): string {
  if (typeof time === "string") return time;
  if (typeof time === "number") {
    return new Date(time * 1000).toISOString().slice(0, 10);
  }
  // BusinessDay
  const y = String(time.year).padStart(4, "0");
  const m = String(time.month).padStart(2, "0");
  const d = String(time.day).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function extractSeriesValue(data: unknown): number | null {
  if (!data || typeof data !== "object") return null;
  if ("value" in data) {
    const v = (data as { value?: unknown }).value;
    return typeof v === "number" ? v : null;
  }
  if ("close" in data) {
    const v = (data as { close?: unknown }).close;
    return typeof v === "number" ? v : null;
  }
  return null;
}

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

const VOLUME_SCALE_ID = "volume";

type Props = {
  balance: DailyPoint[];
  inflow: DailyPoint[];
  outflow: DailyPoint[];
  range: HqChartSeriesRange;
  visibleSeries: VisibleHeroCashSeries;
};

const HeroCashChart: React.FC<Props> = ({ balance, inflow, outflow, range, visibleSeries }) => {
  const stageRef = React.useRef<HTMLDivElement | null>(null);
  const chartElRef = React.useRef<HTMLDivElement | null>(null);

  const chartRef = React.useRef<IChartApi | null>(null);
  const balanceSeriesRef = React.useRef<ISeriesApi<"Area"> | null>(null);
  const inflowSeriesRef = React.useRef<ISeriesApi<"Histogram"> | null>(null);
  const outflowSeriesRef = React.useRef<ISeriesApi<"Histogram"> | null>(null);

  const [tooltip, setTooltip] = React.useState<TooltipModel>({
    visible: false,
    x: 0,
    y: 0,
    date: "",
    balance: null,
    inflow: null,
    outflow: null,
  });

  React.useEffect(() => {
    const el = chartElRef.current;
    const stage = stageRef.current;
    if (!el || !stage) return;

    const computed = getComputedStyle(stage);
    const bg = computed.backgroundColor || "rgba(0,0,0,0)";

    const chart = createChart(el, {
      width: stage.clientWidth,
      height: stage.clientHeight,
      layout: {
        background: { type: ColorType.Solid, color: bg },
        textColor: "rgba(255, 255, 255, 0.65)",
        fontFamily: "var(--font-family-helvetica-special, 'Helvetica Special', sans-serif)",
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: "rgba(255, 255, 255, 0.06)" },
        horzLines: { color: "rgba(255, 255, 255, 0.06)" },
      },
      rightPriceScale: {
        borderVisible: false,
        scaleMargins: { top: 0.12, bottom: 0.18 },
      },
      timeScale: {
        borderVisible: false,
        rightOffset: 2,
        fixLeftEdge: true,
        fixRightEdge: true,
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: "rgba(255, 255, 255, 0.22)", width: 1, labelBackgroundColor: "rgba(0, 0, 0, 0.8)" },
        horzLine: { color: "rgba(255, 255, 255, 0.18)", width: 1, labelBackgroundColor: "rgba(0, 0, 0, 0.8)" },
      },
      handleScroll: {
        mouseWheel: false,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        axisPressedMouseMove: false,
        mouseWheel: false,
        pinch: true,
      },
    });

    const balanceSeries = chart.addSeries(AreaSeries, {
      lineColor: "rgba(45, 212, 191, 0.95)",
      topColor: "rgba(45, 212, 191, 0.18)",
      bottomColor: "rgba(45, 212, 191, 0.02)",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    const inflowSeries = chart.addSeries(HistogramSeries, {
      color: "rgba(45, 212, 191, 0.32)",
      priceScaleId: VOLUME_SCALE_ID,
      base: 0,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    const outflowSeries = chart.addSeries(HistogramSeries, {
      color: "rgba(250, 51, 86, 0.26)",
      priceScaleId: VOLUME_SCALE_ID,
      base: 0,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    chart.priceScale(VOLUME_SCALE_ID).applyOptions({
      scaleMargins: { top: 0.78, bottom: 0.02 },
      borderVisible: false,
      visible: false,
    });

    balanceSeriesRef.current = balanceSeries;
    inflowSeriesRef.current = inflowSeries;
    outflowSeriesRef.current = outflowSeries;
    chartRef.current = chart;

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const cr = entry.contentRect;
      const width = Math.floor(cr.width);
      const height = Math.floor(cr.height);
      chart.applyOptions({ width, height });

      // Slightly denser bars on wider screens; fewer ticks on small screens.
      const isMobile = width < 520;
      chart.applyOptions({
        timeScale: {
          barSpacing: isMobile ? 10 : 14,
        },
        rightPriceScale: {
          minimumWidth: isMobile ? 44 : 56,
        },
      });

      chart.timeScale().fitContent();
    });
    ro.observe(stage);

    const onCrosshair = (param: MouseEventParams) => {
      if (!param || !param.point || !param.time || param.point.x < 0 || param.point.y < 0) {
        setTooltip((t) => (t.visible ? { ...t, visible: false } : t));
        return;
      }

      const iso = timeToIso(param.time as Time);
      const b = extractSeriesValue(param.seriesData.get(balanceSeries));
      const infl = extractSeriesValue(param.seriesData.get(inflowSeries));
      const out = extractSeriesValue(param.seriesData.get(outflowSeries));

      const stageRect = stage.getBoundingClientRect();
      const tooltipWidth = 230;
      const tooltipHeight = 108;

      const x = Math.round(param.point.x);
      const y = Math.round(param.point.y);

      let left = x + 12;
      if (left + tooltipWidth > stageRect.width - 8) left = x - tooltipWidth - 12;
      left = Math.max(8, Math.min(left, Math.floor(stageRect.width - tooltipWidth - 8)));

      let top = y - Math.floor(tooltipHeight / 2);
      top = Math.max(8, Math.min(top, Math.floor(stageRect.height - tooltipHeight - 8)));

      setTooltip({
        visible: true,
        x: left,
        y: top,
        date: iso,
        balance: b,
        inflow: infl,
        outflow: out,
      });
    };

    chart.subscribeCrosshairMove(onCrosshair);

    return () => {
      ro.disconnect();
      chart.unsubscribeCrosshairMove(onCrosshair);
      chart.remove();
      chartRef.current = null;
      balanceSeriesRef.current = null;
      inflowSeriesRef.current = null;
      outflowSeriesRef.current = null;
    };
  }, []);

  React.useEffect(() => {
    const chart = chartRef.current;
    const bal = balanceSeriesRef.current;
    const infl = inflowSeriesRef.current;
    const out = outflowSeriesRef.current;
    if (!chart || !bal || !infl || !out) return;

    bal.setData(balance);
    infl.setData(inflow);
    out.setData(outflow);

    chart.timeScale().fitContent();
  }, [balance, inflow, outflow]);

  React.useEffect(() => {
    chartRef.current?.timeScale().fitContent();
  }, [range]);

  React.useEffect(() => {
    balanceSeriesRef.current?.applyOptions({ visible: visibleSeries.balance });
    inflowSeriesRef.current?.applyOptions({ visible: visibleSeries.inflow });
    outflowSeriesRef.current?.applyOptions({ visible: visibleSeries.outflow });
  }, [visibleSeries.balance, visibleSeries.inflow, visibleSeries.outflow]);

  const net = (tooltip.inflow ?? 0) - (tooltip.outflow ?? 0);

  return (
    <div className={styles.wrap}>
      <div ref={stageRef} className={styles.stage}>
        <div ref={chartElRef} className={styles.chart} />

        <div
          className={[styles.tooltip, tooltip.visible ? styles.tooltipVisible : ""].filter(Boolean).join(" ")}
          style={{ left: tooltip.x, top: tooltip.y }}
          aria-hidden={!tooltip.visible}
        >
          <div className={styles.tooltipTitle}>{tooltip.date}</div>
          <div className={styles.tooltipRow}>
            Balance: {tooltip.balance === null ? "—" : money.format(tooltip.balance)}
          </div>
          <div className={styles.tooltipRow}>
            Inflow: {tooltip.inflow === null ? "—" : money.format(tooltip.inflow)}
          </div>
          <div className={styles.tooltipRow}>
            Outflow: {tooltip.outflow === null ? "—" : money.format(tooltip.outflow)}
          </div>
          <div className={styles.tooltipRow}>Net: {money.format(net)}</div>
        </div>
      </div>
    </div>
  );
};

export default HeroCashChart;
