import React, { useState, useEffect } from "react";
import { HelmetProvider } from "react-helmet-async";
import Modal from "react-modal";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { BrowserRouter as Router, useLocation } from "react-router-dom";
import "@fortawesome/fontawesome-free/css/all.min.css";
import { NavigationDirectionProvider } from "./contexts/NavigationDirectionProvider";
import AuthEventHandler from "./contexts/autheventhandler";
import { AuthProvider } from "./contexts/AuthContext";
import { DataProvider } from "./contexts/DataProvider";
import { InvitesProvider } from "./contexts/InvitesProvider";
import { NotificationProvider } from "./contexts/NotificationProvider";
import { DMConversationProvider } from "./contexts/DMConversationContext";
import { ScrollProvider } from "./contexts/ScrollProvider";
import ScrollToTopButton from "../shared/ui/ScrollToTopButton";
import { SocketProvider } from "./contexts/SocketProvider";
import NotificationSocketBridge from "./NotificationSocketBridge";
import { OnlineStatusProvider } from "./contexts/OnlineStatusContext";
import AppRoutes from "./routes";
import Headermain from "../shared/ui/Header";
import Preloader from "../shared/ui/Preloader";
import { NotificationContainer } from "../shared/ui/ToastNotifications";

gsap.registerPlugin(ScrollTrigger, useGSAP);

if (typeof document !== "undefined") {
    Modal.setAppElement("#root");
}

interface MainContentProps {
    isLoading: boolean;
}

export default function App(): React.ReactElement {
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    if (isLoading) {
      const timer = setTimeout(() => {
        setIsLoading(false);
        sessionStorage.setItem("isLoaded", "true"); // Set in session storage that loading has completed
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [isLoading]);

  useEffect(() => {
    const setFavicon = (darkMode: boolean): void => {
      const link = document.querySelector(
        "link[rel~='icon']"
      ) as HTMLLinkElement;
      if (!link) return;
      // Use .ico files that exist in /public; default + light variant
      link.href = darkMode ? "/favicon-light.ico" : "/favicon.ico";
      link.type = "image/x-icon";
    };

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    setFavicon(mediaQuery.matches);

    const handleChange = (e: MediaQueryListEvent): void => {
      setFavicon(e.matches);
    };

    mediaQuery.addListener(handleChange);
    return () => {
      mediaQuery.removeListener(handleChange);
    };
  }, []);

  return (
    <HelmetProvider>
      <AuthProvider>
        <DataProvider>
          <InvitesProvider>
            <NotificationProvider>
              <DMConversationProvider>
                <SocketProvider>
                  <OnlineStatusProvider>
                    <NotificationSocketBridge>
                      <ScrollProvider>
                        <NavigationDirectionProvider>
                          <Router basename={import.meta.env.BASE_URL}>
                            <AuthEventHandler />
                            <MainContent isLoading={isLoading} />
                            <NotificationContainer />
                          </Router>
                        </NavigationDirectionProvider>
                      </ScrollProvider>
                    </NotificationSocketBridge>
                  </OnlineStatusProvider>
                </SocketProvider>
              </DMConversationProvider>
            </NotificationProvider>
          </InvitesProvider>
        </DataProvider>
      </AuthProvider>
    </HelmetProvider>
  );
}

function MainContent({ isLoading }: MainContentProps): React.ReactElement {
    const location = useLocation();
    const hideHeader = location.pathname.startsWith("/dashboard");
    
    return isLoading ? (
        <Preloader />
    ) : (
        <>
            {!hideHeader && <Headermain />}
            <AppRoutes />
            <ScrollToTopButton />
        </>
    );
}








