import React from "react";
import { Navigate } from "react-router-dom";

const HQOverview = React.lazy(() => import("./pages/HQOverview"));
const AccountsPage = React.lazy(() => import("./pages/AccountsPage"));
const TransactionsPage = React.lazy(() => import("./pages/TransactionsPage"));
const ImportPage = React.lazy(() => import("./pages/ImportPage"));
const ReportsPage = React.lazy(() => import("./pages/ReportsPage"));
const InvoicesPage = React.lazy(() => import("./pages/InvoicesPage"));

export type HQRouteConfig =
  | { index: true; element: React.ReactElement }
  | { index: false; path: string; element: React.ReactElement };

export const HQ_ROUTE_SEGMENTS = [
  "",
  "hq/import",
  "hq/accounts",
  "hq/recurring",
  "hq/top-categories",
  "hq/transactions",
  "hq/reports",
  "hq/invoices",
] as const;

export const hqRoutes: HQRouteConfig[] = [
  { index: true, element: <HQOverview /> },
  { index: false, path: "hq/import", element: <ImportPage /> },
  { index: false, path: "hq/accounts", element: <AccountsPage /> },
  { index: false, path: "hq/recurring", element: <Navigate to="/dashboard/hq/transactions?filter=recurring" replace /> },
  { index: false, path: "hq/top-categories", element: <Navigate to="/dashboard/hq/transactions" replace /> },
  { index: false, path: "hq/transactions", element: <TransactionsPage /> },
  { index: false, path: "hq/reports", element: <ReportsPage /> },
  { index: false, path: "hq/invoices", element: <InvoicesPage /> },
  // Legacy HQ routes (tasks/events/messages) have moved out of HQ.
  { index: false, path: "hq/tasks", element: <Navigate to="/dashboard/tasks" replace /> },
  { index: false, path: "hq/events", element: <Navigate to="/dashboard/projects" replace /> },
  { index: false, path: "hq/messages", element: <Navigate to="/dashboard/messages" replace /> },
];

export default hqRoutes;
