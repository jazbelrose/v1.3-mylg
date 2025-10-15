import React, { useRef, useState, useEffect } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";

// Use modular shared styles (already globally imported in main.tsx)
import "./header.css";
import Menuopened from "../../assets/svg/menu-open.svg?react";
import Menuclosed from "../../assets/svg/menu-closed.svg?react";
import { useAuth } from "@/app/contexts/useAuth";
import { useScrollContext } from "../../app/contexts/useScrollContext";
import { signOut } from "aws-amplify/auth";
import useInactivityLogout from "../../app/contexts/useInactivityLogout";
import Cookies from "js-cookie";
import gsap from "gsap";
import ScrambleText from "scramble-text";

const Headermain: React.FC = () => {
    useInactivityLogout();
    const location = useLocation();
    const navigate = useNavigate();
    const [isActive, setActive] = useState<boolean>(false);
    const menuAnimation = useRef<gsap.core.Timeline | null>(null);
    const scrollableDivRef = useRef<HTMLDivElement | null>(null);
    const [prevScrollPos, setPrevScrollPos] = useState<number>(0);
    const { isHeaderVisible, updateHeaderVisibility } = useScrollContext();
    const { isAuthenticated, setIsAuthenticated, setCognitoUser } = useAuth();
    const logoRef = useRef<HTMLAnchorElement | null>(null);
    const logoHoveredRef = useRef<boolean>(false);
    const [logoOriginalColor, setLogoOriginalColor] = useState<string | null>(null);
    const logoScrambleInstance = useRef<ScrambleText | null>(null);

    // Removed dropdown state/logic completely
    const getLinkClass = (path: string): string => {
        const currentPath = location.pathname.split(/[?#]/)[0];
        const isExactMatch = currentPath === path;
        const isSubpath = path !== "/" && currentPath.startsWith(`${path}/`);
        return isExactMatch || isSubpath ? "active-link" : "";
    };

    useEffect(() => {
        // Close any open menu when location changes
    }, [location]);

    const handleSignOut = async (): Promise<void> => {
        if (isActive) {
            // Close the mobile nav menu if it's open
            handleToggle();
        }
        try {
            await signOut();
            setIsAuthenticated(false);
            setCognitoUser(null);
            navigate("/login");
            Cookies.remove("myCookie");
        } catch (error) {
            console.error("Error during sign out:", error);
        }
    };

    const handleScroll = (): void => {
        const currentScrollPos = window.scrollY;
        if (currentScrollPos <= 5) {
            updateHeaderVisibility(true);
        } else {
            const isScrollingUp = prevScrollPos > currentScrollPos;
            updateHeaderVisibility(isScrollingUp);
        }
        setPrevScrollPos(currentScrollPos);
    };

    useEffect(() => {
        const scrollableDiv = scrollableDivRef.current;
        if (scrollableDiv) {
            scrollableDiv.addEventListener("scroll", handleScroll);
        }
        return () => {
            if (scrollableDiv) {
                scrollableDiv.removeEventListener("scroll", handleScroll);
            }
        };
    });

    useEffect(() => {
        gsap.set(".span-open", {
            attr: { d: "M0 2S175 1 500 1s500 1 500 1V0H0Z" }
        });
        menuAnimation.current = gsap.timeline({ paused: true })
            .to(".span-open", {
                duration: 0.3,
                attr: { d: "M0 502S175 272 500 272s500 230 500 230V0H0Z" },
                ease: "Power2.easeIn",
                onStart: () => {
                    const navMenu = document.querySelector(".nav-bar-menu") as HTMLElement;
                    if (navMenu) {
                        navMenu.classList.add("opened");
                        gsap.set(".nav-bar-menu", { visibility: "visible" });
                    }
                },
                onReverseComplete: () => {
                    const navMenu = document.querySelector(".nav-bar-menu") as HTMLElement;
                    if (navMenu) {
                        navMenu.classList.remove("opened");
                    }
                }
            })
            .to(".span-open", {
                duration: 0.3,
                attr: { d: "M0,1005S175,995,500,995s500,5,500,5V0H0Z" },
                ease: "Power2.easeOut"
            })
            .to(".menu .menu-item > a", {
                duration: 0.3,
                opacity: 1,
                transform: "translateY(0)",
                stagger: 0.1,
                ease: "Power2.easeOut"
            })
            .eventCallback("onComplete", () => {
                setActive(true);
            });
    }, []);

    const handleToggle = (): void => {
        const htmlElement = document.documentElement;

        if (isActive) {
            if (menuAnimation.current) {
                menuAnimation.current.reverse();
                menuAnimation.current.eventCallback("onReverseComplete", () => {
                    setActive(false);
                    document.body.classList.remove("ovhidden");
                    htmlElement.classList.remove("globalnav--noscroll");
                    const navMenu = document.querySelector(".nav-bar-menu") as HTMLElement | null;
                    if (navMenu) {
                        navMenu.classList.remove("opened");
                    }
                });
            } else {
                setActive(false);
                document.body.classList.remove("ovhidden");
                htmlElement.classList.remove("globalnav--noscroll");
            }
        } else {
            htmlElement.classList.add("globalnav--noscroll");
            document.body.classList.add("ovhidden");
            if (menuAnimation.current) {
                menuAnimation.current.play();
                menuAnimation.current.eventCallback("onComplete", () => {
                    setActive(true);
                    htmlElement.classList.add("globalnav--noscroll");
                });
            } else {
                setActive(true);
            }
        }
    };

    const handleDashboardHomeClick = (): void => {
        navigate("/dashboard");
    };

    const handleLogoMouseEnter = (): void => {
        if (logoScrambleInstance.current) return;
        logoHoveredRef.current = true;
        const logoElem = logoRef.current;
        const scrambledElem = logoElem?.querySelector(".scrambled") as HTMLElement;
        if (scrambledElem && logoElem) {
            logoElem.style.width = `${logoElem.offsetWidth}px`;
            logoScrambleInstance.current = new ScrambleText(scrambledElem, {
                timeOffset: 25,
                chars: ["o", "¦"],
                callback: () => {
                    if (logoHoveredRef.current) {
                        scrambledElem.style.color = "#FA3356";
                    }
                    logoScrambleInstance.current = null;
                }
            });
            logoScrambleInstance.current.start().play();
        }
    };

    const handleLogoMouseLeave = (): void => {
        logoHoveredRef.current = false;
        const scrambledElem = logoRef.current?.querySelector(".scrambled") as HTMLElement;
        if (scrambledElem) {
            scrambledElem.style.color = logoOriginalColor || "var(--text-color)";
        }
    };

    useEffect(() => {
        const scrambledElem = logoRef.current?.querySelector(".scrambled") as HTMLElement;
        if (scrambledElem) {
            setLogoOriginalColor(getComputedStyle(scrambledElem).color);
        }
        const handleResize = (): void => {
            const logoElem = logoRef.current;
            if (logoElem) {
                logoElem.style.width = "auto";
            }
        };
        window.addEventListener("resize", handleResize);
        return () => {
            window.removeEventListener("resize", handleResize);
        };
    }, []);

    return (
        <>
            <header className={`fixed-top header ${isHeaderVisible ? "" : "hide"}`}>
                <div className="nav-bar">
                    <Link 
                        to="/" 
                        className="site-logo" 
                        ref={logoRef} 
                        onMouseEnter={handleLogoMouseEnter} 
                        onMouseLeave={handleLogoMouseLeave}
                    >
                        <span className="scrambled">*MYLG!*</span>
                    </Link>
                    <div className="nav-links">
                        <div className="menu-item">
                            {isAuthenticated ? (
                                <Link 
                                    onClick={handleDashboardHomeClick} 
                                    to="/dashboard" 
                                    className={`my-3 sign-out-link ${getLinkClass("/dashboard")}`}
                                >
                                    DASHBOARD
                                </Link>
                            ) : (
                                <Link to="/login" className={`my-3 sign-out-link ${getLinkClass("/login")}`}>
                                    LOGIN
                                </Link>
                            )}
                        </div>
                        <div className="menu-item">
                            {isAuthenticated ? (
                                <Link onClick={handleSignOut} to="/login" className="my-3 sign-out-link">
                                    SIGN-OUT
                                </Link>
                            ) : (
                                <Link to="/register" className="my-3">
                                    SIGN UP
                                </Link>
                            )}
                        </div>
                    </div>
                    <div className="right-bar">
                        <button className="toggle-button" onClick={handleToggle}>
                            {isActive ? <Menuopened /> : <Menuclosed />}
                        </button>
                    </div>
                </div>
                <div className="nav-bar-menu">
                    <div className="svg-wrapper">
                        <svg viewBox="0 0 1000 1000" preserveAspectRatio="none">
                            <path 
                                className="span-open" 
                                d="M0 2S175 1 500 1s500 1 500 1V0H0Z" 
                                fill="#0c0c0c" 
                            />
                        </svg>
                    </div>
                    <div className="menu-wrapper">
                        <div className="menu-container">
                            <ul className="menu">
                                <li className="menu-item">
                                    <Link onClick={handleToggle} to="/" className="my-3">
                                        HOME
                                    </Link>
                                </li>
                                <li className="menu-item">
                                    {isAuthenticated ? (
                                        <Link 
                                            onClick={handleToggle} 
                                            to="/dashboard" 
                                            className={`my-3 sign-out-link ${getLinkClass("/dashboard")}`}
                                        >
                                            DASHBOARD
                                        </Link>
                                    ) : (
                                        <Link 
                                            onClick={handleToggle} 
                                            to="/login" 
                                            className={`my-3 sign-out-link ${getLinkClass("/login")}`}
                                        >
                                            LOGIN
                                        </Link>
                                    )}
                                </li>
                                <li className="menu-item">
                                    {isAuthenticated ? (
                                        <Link onClick={handleSignOut} to="/login" className="my-3 sign-out-link">
                                            SIGN-OUT
                                        </Link>
                                    ) : (
                                        <Link onClick={handleToggle} to="/register" className="my-3">
                                            SIGN UP
                                        </Link>
                                    )}
                                </li>
                            </ul>
                        </div>
                    </div>
                </div>
            </header>
        </>
    );
};

export default Headermain;








