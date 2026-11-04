"use client";
import { useEffect, useState } from "react";

let cache: { at: number; admin: boolean } | null = null;

/**
 * ¿La sesión actual es de administrador? (lo confirma el servidor; el
 * resultado se recuerda un minuto). Solo sirve para mostrar botones: cada
 * acción de administrador se vuelve a validar en el servidor.
 */
export function useEsAdmin(activo = true): boolean {
  const [admin, setAdmin] = useState(cache?.admin ?? false);
  useEffect(() => {
    if (!activo) return;
    if (cache && Date.now() - cache.at < 60_000) {
      setAdmin(cache.admin);
      return;
    }
    let vivo = true;
    fetch("/api/admin/estado", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const es = !!j?.admin;
        cache = { at: Date.now(), admin: es };
        if (vivo) setAdmin(es);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [activo]);
  return admin;
}
