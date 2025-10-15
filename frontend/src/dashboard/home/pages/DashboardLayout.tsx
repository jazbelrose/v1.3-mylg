import React, { useEffect, useRef } from "react";
import { Helmet } from "react-helmet-async";
import { useLocation, useNavigate, Outlet } from "react-router-dom";
import { useData } from "@/app/contexts/useData";
import "./dashboard-styles.css";


const DASHBOARD_LAST_PATH_KEY = "dashboardLastPath";
const DASHBOARD_LAST_PATH_VERSION_KEY = "dashboardLastPathVersion";
const DASHBOARD_LAST_PATH_VERSION = "2";

const buildDashboardHQPath = (suffix: string): string => {
  if (!suffix || suffix === "/") {
    return "/dashboard";
  }

  const normalizedSuffix = suffix.startsWith("/") ? suffix : `/${suffix}`;
  return `/dashboard/hq${normalizedSuffix}`;
};

const mapLegacyDashboardPath = (fullPath: string): string => {
  if (!fullPath) {
    return "/dashboard";
  }

  const [pathOnly, rest = ""] = fullPath.split(/(?=[?#])/);
  let nextPath = pathOnly;

  if (
    pathOnly === "/dashboard" ||
    pathOnly === "/dashboard/welcome" ||
    pathOnly === "/dashboard/projects-overview"
  ) {
    nextPath = "/dashboard/projects";
  } else if (pathOnly === "/dashboard/projects") {
    nextPath = "/dashboard/projects/allprojects";
  } else if (pathOnly.startsWith("/hq")) {
    const suffix = pathOnly.replace(/^\/hq/, "");
    nextPath = buildDashboardHQPath(suffix);
  }

  return `${nextPath}${rest}`;
};

const Dashboard: React.FC = () => {
  // If your DataProvider has types, replace `any` below with the real shape.
  const { opacity } = useData() as { opacity?: number };

  const location = useLocation();
  const navigate = useNavigate();
  const hasRestored = useRef<boolean>(false);

  const getPageTitle = (): string => {
    const path = location.pathname;
    if (
      path.startsWith("/dashboard/projects/") &&
      !path.startsWith("/dashboard/projects/allprojects")
    ) {
      return "Dashboard - Project Details";
    }
    switch (path) {
      case "/dashboard":
        return "Dashboard - HQ";
      case "/dashboard/new":
        return "Dashboard - Start something";
      case "/dashboard/projects":
        return "Dashboard - Project List";
      case "/dashboard/projects/allprojects":
        return "Dashboard - Project List";
      case "/dashboard/tasks":
        return "Dashboard - Tasks";
      case "/dashboard/settings":
        return "Dashboard - Settings";
      case "/dashboard/collaborators":
        return "Dashboard - Collaborators";
      case "/dashboard/hq/accounts":
        return "Dashboard - Accounts";
      case "/dashboard/hq/transactions":
        return "Dashboard - Transactions";
      case "/dashboard/hq/reports":
        return "Dashboard - Reports";
      case "/dashboard/hq/invoices":
        return "Dashboard - Invoices";
      case "/dashboard/hq/tasks":
        return "Dashboard - Tasks";
      case "/dashboard/hq/events":
        return "Dashboard - Events";
      case "/dashboard/hq/messages":
        return "Dashboard - Messages";
      default:
        return "Dashboard";
    }
  };

  // Persist last visited dashboard path
  useEffect(() => {
    if (location.pathname.startsWith("/dashboard")) {
      try {
        localStorage.setItem(
          DASHBOARD_LAST_PATH_KEY,
          location.pathname + location.search
        );
        localStorage.setItem(DASHBOARD_LAST_PATH_VERSION_KEY, DASHBOARD_LAST_PATH_VERSION);
      } catch {
        // ignore storage errors
      }
    }
  }, [location]);

  // Restore last path on first load of /dashboard
  useEffect(() => {
    if (hasRestored.current) return;
    hasRestored.current = true;

    if (location.pathname === "/dashboard") {
      let saved: string | null = null;
      let savedVersion: string | null = null;
      try {
        saved = localStorage.getItem(DASHBOARD_LAST_PATH_KEY);
        savedVersion = localStorage.getItem(DASHBOARD_LAST_PATH_VERSION_KEY);
      } catch {
        // ignore storage errors
      }

      if (saved) {
        const normalized =
          savedVersion === DASHBOARD_LAST_PATH_VERSION
            ? saved
            : mapLegacyDashboardPath(saved);

        if (normalized !== "/dashboard") {
          navigate(normalized, { replace: true });
          return;
        }
      }

      navigate("/dashboard", { replace: true });
    }
  }, [location, navigate]);

  const opacityClass = opacity === 1 ? "opacity-high" : "opacity-low";

  return (
    <>
      <Helmet>
        <meta charSet="utf-8" />
        <title>{getPageTitle()}</title>
        <meta
          name="description"
          content="Manage your projects efficiently with the MYLG dashboard."
        />
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <div className={opacityClass}>
        <Outlet />
      </div>
    </>
  );
};

export default Dashboard;









