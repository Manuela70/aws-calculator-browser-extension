// background.js — Service worker (módulo): el icono de la extensión abre el panel lateral.
// PROVISIONAL (U1, walking skeleton). Dueño final: U6/U7.
// Sin red, sin estado: solo configura el comportamiento del panel (NFR4.5).

function enableSidePanelOnActionClick() {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) =>
      console.error("[aws-calc] background error", "setPanelBehavior falló", error),
    );
}

chrome.runtime.onInstalled.addListener(enableSidePanelOnActionClick);
chrome.runtime.onStartup.addListener(enableSidePanelOnActionClick);
