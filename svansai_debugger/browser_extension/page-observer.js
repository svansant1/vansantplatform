(() => {
  const emit = (message) => {
    window.postMessage({
      source: "svansai-page-observer",
      message: String(message || "Page runtime error").slice(0, 300),
    }, "*");
  };

  window.addEventListener("error", (event) => {
    if (event.target === window) emit(event.message);
  });
  window.addEventListener("unhandledrejection", (event) => {
    emit(event.reason instanceof Error ? event.reason.message : String(event.reason));
  });
})();
