import type { ReactNode } from "react";
import styles from "./HQCard.module.css";

export type HQCardProps = {
  title: string;
  metric?: ReactNode;
  subtitle?: ReactNode;
  badge?: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
  className?: string;
  onClick?: () => void;
  "aria-label"?: string;
};

export function HQCard({
  title,
  metric,
  subtitle,
  badge,
  footer,
  children,
  className,
  onClick,
  "aria-label": ariaLabel,
}: HQCardProps) {
  const isClickable = typeof onClick === "function";

  return (
    <section
      className={[styles.card, isClickable ? styles.cardClickable : "", className].filter(Boolean).join(" ")}
      aria-label={ariaLabel}
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onClick={isClickable ? onClick : undefined}
      onKeyDown={
        isClickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      <header className={styles.cardHeader}>
        <div>
          <h3 className={styles.cardTitle}>{title}</h3>
          {subtitle ? <p className={styles.cardSubtitle}>{subtitle}</p> : null}
        </div>
        {badge ? <span className={styles.badge}>{badge}</span> : null}
      </header>

      {metric ? <div className={styles.metric}>{metric}</div> : null}

      <div className={styles.content}>{children}</div>

      {footer ? <footer className={styles.footer}>{footer}</footer> : null}
    </section>
  );
}

export default HQCard;
