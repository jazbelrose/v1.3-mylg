import React from 'react';
import ReactDOM from 'react-dom/client';
import { Amplify } from 'aws-amplify';
import Modal from 'react-modal';
import { ConfigProvider } from 'antd';

import awsConfig from './aws-exports';
import App from './app/App';

import 'antd/dist/reset.css';
import './index.css';
import './components/preloader/style.css';

Amplify.configure(awsConfig);

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement,
);
Modal.setAppElement(document.getElementById('root') as HTMLElement);

root.render(
  <ConfigProvider>
    <App />
  </ConfigProvider>,
);










