import type { ReactNode } from "react";
import styles from "./HQCard.module.css";

export type HQCardProps = {
  title: string;
  metric?: ReactNode;
  subtitle?: ReactNode;
  badge?: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
  "aria-label"?: string;
};

export function HQCard({
  title,
  metric,
  subtitle,
  badge,
  footer,
  children,
  "aria-label": ariaLabel,
}: HQCardProps) {
  return (
    <section className={styles.card} aria-label={ariaLabel}>
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
