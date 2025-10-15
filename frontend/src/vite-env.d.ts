/// <reference types="vite/client" />

declare module '*.svg' {
  const content: React.FC<React.SVGProps<SVGSVGElement>>;
  export default content;
}

declare module '*.svg?react' {
  import React from 'react';
  const ReactComponent: React.FunctionComponent<React.SVGProps<SVGSVGElement>>;
  export default ReactComponent;
}

declare module './aws-exports' {
  const awsConfig: unknown;
  export default awsConfig;
}

interface ImportMetaEnv {
  readonly VITE_APP_TITLE: string;
  readonly VITE_APP_ENV: string;
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly BASE_URL: string;
  readonly NODE_ENV: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Node.js global types for process
declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NODE_ENV: string;
    }
    interface Global {
      process: {
        env: ProcessEnv;
      };
    }
  }
  
  var process: {
    env: {
      NODE_ENV: string;
    };
  };

  var __dirname: string;
}









