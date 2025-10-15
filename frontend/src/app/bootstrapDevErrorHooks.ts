// Global error handlers to aid in development debugging

window.addEventListener('error', (e: ErrorEvent) => {
  console.error('[window error]', e.error || e.message || e);
});

window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
  console.error('[unhandledrejection]', e.reason || e);
});

// Export empty object to make this a module
export {};










