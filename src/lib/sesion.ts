/* Acceso con una clave compartida del local (CLAVE_ACCESO). La cookie guarda
   una firma HMAC de la clave, nunca la clave misma. Funciona en edge y node. */

export const COOKIE = "fi_sesion";

export function claveConfigurada(): boolean {
  return !!process.env.CLAVE_ACCESO;
}

export async function firma(): Promise<string> {
  const clave = process.env.CLAVE_ACCESO ?? "";
  const secreto = process.env.SESION_SECRETO || clave;
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey("raw", enc.encode(secreto), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, enc.encode(`fi-sesion-v1:${clave}`));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Comparación en tiempo constante */
export function iguales(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
