/* eslint-disable react-refresh/only-export-components */
import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ToastContainer, toast, Slide, Id } from 'react-toastify';
import { FaCheckCircle, FaTimesCircle, FaInfoCircle, FaExclamationTriangle } from 'react-icons/fa';
import styles from './Notification.module.css';
import 'react-toastify/dist/ReactToastify.css';
import { MICRO_WOBBLE_SCALE, SPRING_SOFT } from './motionTokens';

type ToastType = 'success' | 'error' | 'info' | 'warning';

// Provide icons as functions to satisfy react-toastify's icon typing across versions
const icons: Record<ToastType, () => React.ReactNode> = {
  success: () => <FaCheckCircle />,
  error: () => <FaTimesCircle />,
  info: () => <FaInfoCircle />,
  warning: () => <FaExclamationTriangle />,
};

const TOAST_CONTAINER_ID = 'global';

const ToastMessage: React.FC<{ message: string }> = ({ message }) => {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      className={styles.body}
      initial={reduceMotion ? false : { opacity: 0, y: -6, scale: 0.94 }}
      animate={reduceMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
      whileHover={reduceMotion ? undefined : { scale: MICRO_WOBBLE_SCALE }}
      whileFocus={reduceMotion ? undefined : { scale: MICRO_WOBBLE_SCALE }}
      transition={reduceMotion ? undefined : SPRING_SOFT}
    >
      {message}
    </motion.div>
  );
};

const renderToast = (message: string) => () => <ToastMessage message={message} />;

export const notify = (type: ToastType, message: string) => {
  toast.dismiss();
  return toast(renderToast(message), {
    type,
    icon: icons[type],
    className: styles.toast,
    containerId: TOAST_CONTAINER_ID,
  });
};

export const notifyLoading = (message: string) => {
  toast.dismiss();
  return toast.loading(renderToast(message), {
    className: styles.toast,
    containerId: TOAST_CONTAINER_ID,
  });
};

export const updateNotification = (id: Id, type: ToastType, message: string) => {
  toast.update(id, {
    render: renderToast(message),
    type,
    icon: icons[type],
    className: styles.toast,
    isLoading: false,
    autoClose: 3000,
    containerId: TOAST_CONTAINER_ID,
  });
};

export const NotificationContainer: React.FC = () => (
  <ToastContainer
    containerId={TOAST_CONTAINER_ID}
    position="top-center"
    autoClose={3000}
    hideProgressBar
    closeButton={false}
    newestOnTop
    limit={1}
    draggable={false}
    pauseOnHover
    transition={Slide}
    toastClassName={styles.toast}
    style={{ zIndex: 1000000, top: '80px' }}
  />
);

export default NotificationContainer;









