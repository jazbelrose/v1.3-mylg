import React, { useState, useLayoutEffect, Suspense } from "react";
import { Routes, Route, Navigate, useLocation, Location } from "react-router-dom";
import Login from "../dashboard/features/auth/Login/Login";
import Register from "../dashboard/features/auth/Register/Register";
import EmailVerification from "@/dashboard/features/auth/email-verification/EmailVerification";
import EmailChangeVerification from "../dashboard/features/auth/email-verification/EmailChange";
import ForgotPassword from "../dashboard/features/auth/forgot-password/ForgotPassword";
import GalleryPage from "../dashboard/project/features/gallery/GalleryPage";
import { AnimatePresence, motion, Variants } from "framer-motion";
import ProtectedRoute from "./contexts/ProtectedRoute";
import { ErrorBoundary } from "./ErrorBoundary";
import { useData } from "@/app/contexts/useData";
import NotFound from "../shared/ui/404";

import Spinner from "../shared/ui/Spinner";
import { hqRoutes } from "@/hq/routes";

const Dashboard = React.lazy(() => import("../dashboard/home/pages/DashboardLayout"));
const DashboardWelcome = React.lazy(() => import("../dashboard/home/pages/DashboardHome"));
const DashboardNewProject = React.lazy(() => import("@/dashboard/NewProject/NewProject"));
const DashboardSingleProject = React.lazy(() => import("@/dashboard/project/project"));
const DashboardBudgetPage = React.lazy(() => import("../dashboard/project/features/budget/pages/BudgetPage"));
const DashboardCalendarPage = React.lazy(() => import("@/dashboard/project/features/calendar/calendar"));
const DashboardEditorPage = React.lazy(() => import("@/dashboard/project/features/editor/pages/editorpage"));
const DashboardMoodboardPage = React.lazy(() => import("@/dashboard/project/features/moodboard/pages/MoodboardPage"));
const DashboardTasksPage = React.lazy(() => import("../dashboard/home/pages/TasksListPage"));

const ScrollToTop: React.FC = () => {
  const { pathname } = useLocation();
  const { opacity, setOpacity } = useData();
  const opacityClass = opacity === 1 ? "opacity-low" : "opacity-high";
  const [prevPathname, setPrevPathname] = useState<string>("");
  
  useLayoutEffect(() => {
    const blogPostRouteRegex = /^\/blog\/[^/]+$/;
    const dmRouteRegex = /^\/dashboard(?:\/welcome)?\/messages\/[^/]+$/;
    const isBlogPost = blogPostRouteRegex.test(pathname);
    const wasBlogPost = blogPostRouteRegex.test(prevPathname);
    const isDM = dmRouteRegex.test(pathname);
    const wasDM = dmRouteRegex.test(prevPathname);
    const stayingInDashboard = pathname.startsWith("/dashboard") &&
      prevPathname.startsWith("/dashboard");
    const shouldAnimate = !isBlogPost && !wasBlogPost && !isDM && !wasDM && !stayingInDashboard;
    
    let timer: NodeJS.Timeout;
    
    if (shouldAnimate) {
      setOpacity(0);
      window.scrollTo(0, 0);
      timer = setTimeout(() => {
        setOpacity(1);
      }, 300);
    } else {
      setOpacity(1);
    }
    
    setPrevPathname(pathname);
    
    return () => {
      clearTimeout(timer);
      if (shouldAnimate) {
        setOpacity(0);
      }
    };
  }, [pathname, setOpacity, prevPathname]);
  
  return <div className={`page-fade ${opacityClass}`} />;
};

const pageVariants: Variants = {
  initial: { opacity: 0, y: "100vh" }, // changed from 100vw to 100vh
  in: { opacity: 1, y: 0 },
  out: { opacity: 0, y: "100vh" }, // changed from -100vw to -100vh
};

const pageTransition = {
  type: "tween" as const,
  ease: "anticipate",
  duration: 1,
};

const mapHqPathToDashboard = (pathname: string) => {
  const suffix = pathname.replace(/^\/hq/, "");
  if (!suffix || suffix === "/") {
    return "/dashboard";
  }

  const normalizedSuffix = suffix.startsWith("/") ? suffix : `/${suffix}`;
  return `/dashboard/hq${normalizedSuffix}`;
};

const HQRedirect: React.FC = () => {
  const location = useLocation();
  const target = React.useMemo(
    () => `${mapHqPathToDashboard(location.pathname)}${location.search}${location.hash}`,
    [location.hash, location.pathname, location.search]
  );

  return <Navigate to={target} replace />;
};

function AppRoutes(): React.ReactElement {
  const location = useLocation();
  
  return (
    <ErrorBoundary>
      <Suspense fallback={<Spinner />}>
        <ScrollToTop />
        <ActualRoutes location={location} />
      </Suspense>
    </ErrorBoundary>
  );
}

interface ActualRoutesProps {
  location: Location;
}

const ActualRoutes: React.FC<ActualRoutesProps> = ({ location }) => {
  
  return (
    <AnimatePresence mode="wait">
      <Routes key={location.pathname} location={location}>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        

        
        <Route
          path="/gallery/:projectId/:gallerySlug"
          element={
            <motion.div
              initial="initial"
              animate="in"
              exit="out"
              variants={pageVariants}
              transition={pageTransition}
            >
              <GalleryPage projectId={undefined} />
            </motion.div>
          } 
        />
        
        <Route
          path="/dashboard/*"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        >
          {hqRoutes.map((route) => {
            if (route.index) {
              return <Route key="dashboard-hq-index" index element={route.element} />;
            }
            return <Route key={`dashboard-${(route as {path: string}).path}`} path={(route as {path: string}).path} element={route.element} />;
          })}
          <Route path="projects/allprojects" element={<DashboardWelcome />} />
          <Route
            path="projects/:projectId/:projectName?"
            element={<DashboardSingleProject key={location.key} />}
          />
          <Route
            path="projects/:projectId/:projectName?/budget"
            element={<DashboardBudgetPage />}
          />
          <Route
            path="projects/:projectId/:projectName?/calendar"
            element={<DashboardCalendarPage />}
          />
          <Route
            path="projects/:projectId/:projectName?/moodboard"
            element={<DashboardMoodboardPage />}
          />
          <Route
            path="projects/:projectId/:projectName?/editor"
            element={<DashboardEditorPage />}
          />
          <Route path="tasks" element={<DashboardTasksPage />} />
          <Route path="new" element={<DashboardNewProject />} />
          <Route path="welcome/*" element={<Navigate to=".." replace />} />
          <Route path="*" element={<DashboardWelcome />} />
        </Route>
        
        <Route 
          path="/login" 
          element={
            <motion.div
              initial="initial"
              animate="in"
              exit="out"
              variants={pageVariants}
              transition={pageTransition}
            >
              <Login />
            </motion.div>
          } 
        />
        
        <Route 
          path="/register" 
          element={
            <motion.div
              initial="initial"
              animate="in"
              exit="out"
              variants={pageVariants}
              transition={pageTransition}
            >
              <Register />
            </motion.div>
          } 
        />
        
        <Route 
          path="/email-verification" 
          element={
            <motion.div
              initial="initial"
              animate="in"
              exit="out"
              variants={pageVariants}
              transition={pageTransition}
            >
              <EmailVerification registrationData={undefined} userEmail={undefined} />
            </motion.div>
          } 
        />
        
        <Route 
          path="/email-change-verification" 
          element={
            <motion.div
              initial="initial"
              animate="in"
              exit="out"
              variants={pageVariants}
              transition={pageTransition}
            >
              <EmailChangeVerification />
            </motion.div>
          } 
        />
        
        <Route 
          path="/forgot-password" 
          element={
            <motion.div
              initial="initial"
              animate="in"
              exit="out"
              variants={pageVariants}
              transition={pageTransition}
            >
              <ForgotPassword />
            </motion.div>
          } 
        />
        
        <Route
          path="*"
          element={
            <motion.div
              initial="initial"
              animate="in"
              exit="out"
              variants={pageVariants}
              transition={pageTransition}
            >
              <NotFound />
            </motion.div>
          }
        />
        <Route path="/hq/*" element={<HQRedirect />} />
      </Routes>
    </AnimatePresence>
  );
};

export default AppRoutes;












