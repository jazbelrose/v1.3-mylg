import React from "react";

import PageHeader, { type PageHeaderProps } from "./PageHeader";
import styles from "./HeaderShell.module.css";

export type HeaderShellProps = PageHeaderProps;

const HeaderShell: React.FC<HeaderShellProps> = ({ className = "", ...props }) => {
  return <PageHeader {...props} className={[styles.shell, className].filter(Boolean).join(" ")} />;
};

export default HeaderShell;
