import React, { useRef, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import ScrambleText from "scramble-text";
import "./scramble-button.css";

export interface ScrambleButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  text: React.ReactNode;
  to?: string;
  className?: string;
  submitMode?: boolean;
  fontSize?: React.CSSProperties["fontSize"];
  padding?: React.CSSProperties["padding"];
}

export const ScrambleButton: React.FC<ScrambleButtonProps> = ({
  text,
  to,
  className = "",
  submitMode,
  fontSize,
  padding,
  ...props
}) => {
  const btnRef = useRef<HTMLButtonElement>(null);
  const isHoveredRef = useRef(false);
  const [originalColor, setOriginalColor] = useState<string | null>(null);
  let scrambleInstance: ScrambleText | null = null;

  const isTouchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  const buttonType = submitMode ? "submit" : "button";

  const handleMouseEnter = () => {
    if (isTouchDevice && buttonType === "submit") return;
    isHoveredRef.current = true;
    const btnElem = btnRef.current!;
    const scrambledElem = btnElem.querySelector<HTMLSpanElement>(".scrambled");
    if (scrambledElem && !scrambleInstance) {
      btnElem.style.width = `${btnElem.offsetWidth}px`;
      scrambleInstance = new ScrambleText(scrambledElem, {
        timeOffset: 12.5,
        chars: ["o", "¦"],
        callback: () => {
          scrambledElem.style.color = "#fff";
          scrambleInstance = null;
        },
      });
      scrambleInstance.start().play();
    }
  };

  const handleMouseLeave = () => {
    isHoveredRef.current = false;
    const scrambledElem = btnRef.current?.querySelector<HTMLSpanElement>(".scrambled");
    if (scrambledElem) {
      scrambledElem.style.color = originalColor || "var(--text-color)";
    }
  };

  useEffect(() => {
    const scrambledElem = btnRef.current?.querySelector<HTMLSpanElement>(".scrambled");
    if (scrambledElem) {
      setOriginalColor(getComputedStyle(scrambledElem).color);
    }
    const handleResize = () => {
      const btnElem = btnRef.current;
      if (btnElem) {
        btnElem.style.width = "auto";
      }
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  const { style: propStyle, ...restProps } = props;

  const buttonElem = (
    <button
      ref={btnRef}
      type={buttonType}
      className={`scramble-button ${className}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        fontSize,
        padding,
        display: "inline-flex",
        alignItems: "center",
        lineHeight: 1,
        boxSizing: "border-box",
        ...(propStyle as React.CSSProperties),
      }}
      {...restProps}
    >
      <span className="scrambled">{text}</span>
    </button>
  );

  if (to && !submitMode) {
    return <Link to={to}>{buttonElem}</Link>;
  }

  return buttonElem;
};

export default ScrambleButton;










