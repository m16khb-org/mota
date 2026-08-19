window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  window.__installPrompt = event;
});

if ("serviceWorker" in navigator) {
  window.addEventListener(
    "load",
    () => {
      navigator.serviceWorker.register("/sw.js?v=5").catch((error) => {
        console.error("서비스 워커를 등록하지 못했습니다.", error);
      });
    },
    { once: true },
  );
}
