"use strict";

/*
 * Five quick activations of the TT mark reveal the owner TEST download path.
 * This is discoverability only, not access control. The download service MUST
 * authenticate and authorize each request; never point at a public TEST ZIP.
 * No TEST URL or release bytes are shipped in this public repository.
 */
(() => {
  const trigger = document.getElementById("tt-test-download-trigger");
  const dialog = document.getElementById("tt-test-download-notice");
  const closeButton = document.getElementById("tt-test-download-close");
  const privateUrl = document.querySelector('meta[name="tt-test-download-url"]')
    ?.getAttribute("content")?.trim() || "";
  if (!trigger || !dialog || !closeButton) return;

  const GAP_MS = 900;
  const WINDOW_MS = 3800;
  let count = 0;
  let firstAt = 0;
  let previousAt = 0;
  let focusReturn = null;

  function clearStreak() {
    count = 0;
    firstAt = 0;
    previousAt = 0;
  }

  function showNotReady() {
    focusReturn = document.activeElement;
    dialog.hidden = false;
    closeButton.focus();
  }

  function closeNotReady() {
    dialog.hidden = true;
    if (focusReturn && typeof focusReturn.focus === "function") focusReturn.focus();
    focusReturn = null;
  }

  function openOwnerDownload() {
    if (!privateUrl) {
      showNotReady();
      return;
    }
    try {
      const destination = new URL(privateUrl);
      if (destination.protocol !== "https:" || destination.username || destination.password) {
        showNotReady();
        return;
      }
      // The private endpoint must enforce authentication and serve the ZIP.
      window.location.assign(destination.href);
    } catch (_) {
      showNotReady();
    }
  }

  trigger.addEventListener("click", () => {
    const now = performance.now();
    if (!count || now - previousAt > GAP_MS || now - firstAt > WINDOW_MS) {
      count = 1;
      firstAt = now;
    } else {
      count += 1;
    }
    previousAt = now;

    if (count === 5) {
      clearStreak();
      openOwnerDownload();
    }
  });

  closeButton.addEventListener("click", closeNotReady);
  dialog.addEventListener("click", event => {
    if (event.target === dialog) closeNotReady();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !dialog.hidden) closeNotReady();
  });
})();
