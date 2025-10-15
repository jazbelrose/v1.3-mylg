import React from "react";

const HQOverview = React.lazy(() => import("./pages/HQOverview"));
const AccountsPage = React.lazy(() => import("./pages/AccountsPage"));
const TransactionsPage = React.lazy(() => import("./pages/TransactionsPage"));
const ReportsPage = React.lazy(() => import("./pages/ReportsPage"));
const InvoicesPage = React.lazy(() => import("./pages/InvoicesPage"));
const HQTasksPage = React.lazy(() => import("./pages/HQTasksPage"));
const HQEventsPage = React.lazy(() => import("./pages/HQEventsPage"));
const HQMessagesPage = React.lazy(() => import("./pages/HQMessagesPage"));

export type HQRouteConfig =
  | { index: true; element: React.ReactElement }
  | { index: false; path: string; element: React.ReactElement };

export const HQ_ROUTE_SEGMENTS = [
  "",
  "hq/accounts",
  "hq/transactions",
  "hq/reports",
  "hq/invoices",
  "hq/tasks",
  "hq/events",
  "hq/messages",
] as const;

export const hqRoutes: HQRouteConfig[] = [
  { index: true, element: <HQOverview /> },
  { index: false, path: "hq/accounts", element: <AccountsPage /> },
  { index: false, path: "hq/transactions", element: <TransactionsPage /> },
  { index: false, path: "hq/reports", element: <ReportsPage /> },
  { index: false, path: "hq/invoices", element: <InvoicesPage /> },
  { index: false, path: "hq/tasks", element: <HQTasksPage /> },
  { index: false, path: "hq/events", element: <HQEventsPage /> },
  { index: false, path: "hq/messages", element: <HQMessagesPage /> },
];

export default hqRoutes;
