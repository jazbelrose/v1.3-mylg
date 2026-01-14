import React from "react";

import styles from "./PageHeader.module.css";

export type PageHeaderProps = {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  subtitleRight?: React.ReactNode;
  nav?: React.ReactNode;
  controls?: React.ReactNode;
  sticky?: boolean;
  className?: string;
};

const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  actions,
  subtitleRight,
  nav,
  controls,
  sticky = false,
  className = "",
}) => {
  const hasSubtitleRow = Boolean(subtitle || subtitleRight);
  const hasBottomRow = Boolean(nav || controls);

  return (
    <header
      className={[styles.pageHeader, sticky ? styles.sticky : "", className]
        .filter(Boolean)
        .join(" ")}
    >
      <div className={styles.rowA}>
        <div className={styles.titleSlot}>
          <h1 className={styles.pageTitle}>{title}</h1>
        </div>
        {actions ? (
          <div className={styles.rightSlot} aria-label="Page header actions">
            {actions}
          </div>
        ) : null}
      </div>

      {hasSubtitleRow ? (
        <div className={styles.rowB}>
          <div className={styles.subtitleSlot}>
            {subtitle ? <p className={styles.pageSubtitle}>{subtitle}</p> : null}
          </div>
          {subtitleRight ? <div className={styles.rightSlot}>{subtitleRight}</div> : null}
        </div>
      ) : null}

      {hasBottomRow ? (
        <div className={styles.rowC}>
          <div className={styles.navSlot}>{nav}</div>
          <div className={styles.controlsSlot}>{controls}</div>
        </div>
      ) : null}
    </header>
  );
};

export default PageHeader;
