import React from 'react';
import { addClassNamesToElement } from '@lexical/utils';

const LayoutContainer: React.FC<{ templateColumns: string; theme?: Record<string, unknown> }> = ({ templateColumns, theme }) => {
  const domNode = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (domNode.current) {
      domNode.current.style.gridTemplateColumns = templateColumns;
      if (typeof theme?.layoutContainer === 'string') {
        addClassNamesToElement(domNode.current, theme.layoutContainer);
      }
    }
  }, [templateColumns, theme]);

  return <div ref={domNode} data-lexical-layout-container="true" />;
};

export default LayoutContainer;









