import React, { useMemo, useState } from "react";
import HQLayout from "../components/HQLayout";
import HQCard from "../components/HQCard";
import TasksOverviewCard from "@/dashboard/home/components/TasksOverviewCard";
import styles from "./HQOverview.module.css";
import type { HQAlert } from "../types";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const preciseCurrency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

const runwayFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const quickFilters = [
  { id: "month", label: "This month" },
  { id: "quarter", label: "Quarter" },
  { id: "ytd", label: "Year-to-date" },
  { id: "custom", label: "Custom" },
] as const;

const monthlyFlow = [
  { month: "Jan", inflow: 42000, outflow: 36000 },
  { month: "Feb", inflow: 38000, outflow: 41000 },
  { month: "Mar", inflow: 45500, outflow: 39500 },
  { month: "Apr", inflow: 47000, outflow: 42000 },
  { month: "May", inflow: 51000, outflow: 46000 },
  { month: "Jun", inflow: 48800, outflow: 43300 },
];

const categoryBreakdown = [
  { category: "Payroll", amount: 124500 },
  { category: "Production", amount: 88500 },
  { category: "Software", amount: 31200 },
  { category: "Travel", amount: 28600 },
  { category: "Marketing", amount: 19200 },
];

const recurringVendors = [
  { vendor: "Gusto", amount: 8200, cadence: "Bi-weekly payroll" },
  { vendor: "Adobe", amount: 1260, cadence: "Monthly subscription" },
  { vendor: "AWS", amount: 2175, cadence: "Monthly infrastructure" },
  { vendor: "Notion", amount: 360, cadence: "Monthly workspace" },
];

const alerts: HQAlert[] = [
  {
    id: "low-balance",
    severity: "warning",
    message: "Operating account dipped below 2 months of runway this week.",
  },
  {
    id: "unusual-spend",
    severity: "info",
    message: "Unusual spend detected: Travel was 46% higher than the trailing 3-month average.",
  },
];

const upcomingEvents = [
  { id: "event-studio", name: "Summer showcase load-in", date: "Jul 12", location: "Brooklyn Stage" },
  { id: "event-offsite", name: "Crew offsite planning", date: "Jul 19", location: "HQ Loft" },
  { id: "event-campaign", name: "Campaign kickoff with Spotify", date: "Jul 24", location: "Virtual" },
];

const messageDigest = [
  { id: "msg-1", sender: "Taylor P.", preview: "Approved the venue hold — see updated contract." },
  { id: "msg-2", sender: "Morgan A.", preview: "Need final numbers for the August pop-up." },
  { id: "msg-3", sender: "Accounts", preview: "Invoice 2041 marked paid. Apply to AR report." },
];

const HQOverview: React.FC = () => {
  const [selectedRange, setSelectedRange] = useState<(typeof quickFilters)[number]["id"]>("ytd");

  const totals = useMemo(() => {
    const cashOnHand = 214500;
    const avgMonthlyBurn = 34500;
    const runwayMonths = cashOnHand / avgMonthlyBurn;
    const cashIn = monthlyFlow.reduce((acc, row) => acc + row.inflow, 0);
    const cashOut = monthlyFlow.reduce((acc, row) => acc + row.outflow, 0);
    const totalCategory = categoryBreakdown.reduce((acc, row) => acc + row.amount, 0);
    return { cashOnHand, avgMonthlyBurn, runwayMonths, cashIn, cashOut, totalCategory };
  }, []);

  const actions = (
    <div className={styles.filterRow} aria-label="Quick range filters">
      {quickFilters.map((filter) => (
        <button
          key={filter.id}
          type="button"
          className={[styles.filterButton, selectedRange === filter.id ? styles.filterButtonActive : ""]
            .filter(Boolean)
            .join(" ")}
          onClick={() => setSelectedRange(filter.id)}
          aria-pressed={selectedRange === filter.id}
        >
          {filter.label}
        </button>
      ))}
    </div>
  );

  const maxFlow = Math.max(
    ...monthlyFlow.flatMap((row) => [row.inflow, row.outflow])
  );

  return (
    <HQLayout
      title="HQ"
      description="Your company hub for cash, commitments, events, and conversations. Connect Plaid to keep balances and transactions in sync."
      actions={actions}
    >
      <div className={styles.page}>
        <div className={styles.cardsGrid}>
          <HQCard
            title="Cash on hand"
            metric={currency.format(totals.cashOnHand)}
            badge="4 accounts"
            footer="Includes operating, savings, and reserve balances."
            aria-label={`Cash on hand across accounts: ${currency.format(totals.cashOnHand)}.`}
          />

          <HQCard
            title="Runway"
            metric={`${runwayFormatter.format(totals.runwayMonths)} mo`}
            subtitle="Cash on hand ÷ average burn (last 3 months)"
            footer={`Average monthly burn: ${currency.format(totals.avgMonthlyBurn)}`}
            aria-label={`Runway is ${runwayFormatter.format(
              totals.runwayMonths
            )} months based on average monthly burn of ${currency.format(totals.avgMonthlyBurn)}.`}
          />

          <HQCard
            title="Cash in vs cash out"
            subtitle={`Range: ${quickFilters.find((f) => f.id === selectedRange)?.label ?? "Year-to-date"}`}
            badge="Bars show inflow vs outflow"
            aria-label="Monthly cash inflow versus outflow chart"
          >
            <div className={styles.chartBars} role="img" aria-label="Monthly cash flow">
              {monthlyFlow.map((row) => {
                const inflowPercent = Math.round((row.inflow / maxFlow) * 100);
                const outflowPercent = Math.round((row.outflow / maxFlow) * 100);
                return (
                  <div key={row.month} className={styles.chartBarRow}>
                    <div className={styles.chartBar} aria-hidden>
                      <div
                        className={styles.chartBarFill}
                        style={{ width: `${inflowPercent}%` }}
                        title={`${row.month} inflow ${preciseCurrency.format(row.inflow)}`}
                      />
                    </div>
                    <span>{row.month}</span>
                    <div className={styles.chartBar} aria-hidden>
                      <div
                        className={`${styles.chartBarFill} ${styles.chartBarFillMuted}`}
                        style={{ width: `${outflowPercent}%` }}
                        title={`${row.month} outflow ${preciseCurrency.format(row.outflow)}`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </HQCard>

          <HQCard
            title="Top categories"
            subtitle="Year-to-date"
            aria-label="Top spend categories year to date"
          >
            <ul className={styles.list}>
              {categoryBreakdown.map((entry) => {
                const pct = Math.round((entry.amount / totals.totalCategory) * 100);
                return (
                  <li key={entry.category} className={styles.listItem}>
                    <span>{entry.category}</span>
                    <span>{pct}%</span>
                  </li>
                );
              })}
            </ul>
          </HQCard>

          <HQCard
            title="Recurring vendors"
            subtitle="Subscriptions & retainers"
            aria-label="Recurring vendor commitments"
          >
            <ul className={styles.list}>
              {recurringVendors.map((vendor) => (
                <li key={vendor.vendor} className={styles.listItem}>
                  <div>
                    <div>{vendor.vendor}</div>
                    <small>{vendor.cadence}</small>
                  </div>
                  <span>{preciseCurrency.format(vendor.amount)}</span>
                </li>
              ))}
            </ul>
          </HQCard>

          <HQCard
            title="AR vs AP"
            subtitle="Outstanding invoices & bills"
            aria-label="Accounts receivable versus accounts payable"
          >
            <div className={styles.listItem}>
              <span>Accounts receivable</span>
              <span>{currency.format(68500)}</span>
            </div>
            <div className={styles.listItem}>
              <span>Accounts payable</span>
              <span>{currency.format(45200)}</span>
            </div>
          </HQCard>

          <HQCard title="Alerts" aria-label="HQ alerts">
            <ul className={styles.alertsList}>
              {alerts.map((alert) => (
                <li key={alert.id} className={styles.alertItem}>
                  <span className={styles.alertBadge}>{alert.severity}</span>
                  <span>{alert.message}</span>
                </li>
              ))}
            </ul>
          </HQCard>

          <HQCard title="Upcoming events" aria-label="Upcoming events">
            <ul className={styles.eventsList}>
              {upcomingEvents.map((event) => (
                <li key={event.id}>
                  <div className={styles.eventRow}>
                    <span className={styles.eventDate}>{event.date}</span>
                    <div>
                      <div className={styles.eventName}>{event.name}</div>
                      <small className={styles.eventLocation}>{event.location}</small>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </HQCard>

          <HQCard title="Tasks" aria-label="HQ tasks overview">
            <div className={styles.tasksCard}>
              <TasksOverviewCard className={styles.tasksWidget} />
            </div>
          </HQCard>

          <HQCard title="Message highlights" aria-label="Recent HQ messages">
            <ul className={styles.messagesList}>
              {messageDigest.map((message) => (
                <li key={message.id}>
                  <span className={styles.messageSender}>{message.sender}</span>
                  <span className={styles.messagePreview}>{message.preview}</span>
                </li>
              ))}
            </ul>
          </HQCard>
        </div>
      </div>
    </HQLayout>
  );
};

export default HQOverview;
