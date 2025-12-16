import './shared/styles/index.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { Amplify } from 'aws-amplify';
import Modal from 'react-modal';
import { ConfigProvider } from 'antd';
import { Buffer } from 'buffer';

import awsConfig from './aws-exports'; // Ensure aws-exports.js exists and is typed
import App from './app/App';

import 'antd/dist/reset.css';

declare global {
  interface Window {
    Buffer: typeof Buffer;
  }

  interface GlobalThis {
    Buffer: typeof Buffer;
  }
}

if (typeof globalThis !== 'undefined' && typeof globalThis.Buffer === 'undefined') {
  globalThis.Buffer = Buffer;
}


if (import.meta.env.DEV) {
  import('./app/bootstrapDevErrorHooks');
}

// ✅ Amplify config
Amplify.configure(awsConfig);

// ✅ Root element typing with non-null assertion (!)
const rootElement = document.getElementById('root')!;
Modal.setAppElement(rootElement);

const root = ReactDOM.createRoot(rootElement);

root.render(
  <React.StrictMode>
    <ConfigProvider>
      <App />
    </ConfigProvider>
  </React.StrictMode>
);








