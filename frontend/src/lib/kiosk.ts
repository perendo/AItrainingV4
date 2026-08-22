const KIOSK_CONTROL_URL = "http://127.0.0.1:18999/exit";

/**
 * Sale del modo kiosk y cierra la aplicación. Avisa al launcher
 * (start_servers.py) para que termine el navegador y los servidores.
 * Si el control local no está disponible (ejecución sin el launcher),
 * intenta cerrar la ventana con window.close().
 */
export async function exitToDesktop(): Promise<void> {
  try {
    await fetch(KIOSK_CONTROL_URL, { method: "POST" });
    return;
  } catch {
    // El launcher no está presente: intento best-effort de cerrar la ventana.
    window.open("", "_self");
    window.close();
  }
}
