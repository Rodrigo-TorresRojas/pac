import { randomInt } from "node:crypto";
import { Router, type Request } from "express";
import { z } from "zod";
import { clienteDeUsuario, clienteServicio, ErrorHttp } from "../supabase.js";

export const equipo = Router();
const Id = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

/** Solo un administrador activo puede usar estas rutas. */
async function exigirAdmin(req: Request) {
  const { sb, usuarioId } = await clienteDeUsuario(req.get("authorization"));
  const { data } = await sb.from("usuarios").select("rol,activo").eq("id", usuarioId).maybeSingle();
  if (!data?.activo || data.rol !== "admin") throw new ErrorHttp(403, "Solo un administrador puede gestionar el equipo.");
  return { usuarioId, admin: clienteServicio() };
}

/** Contraseña temporal legible: 3 bloques de 4 caracteres sin letras confusas. */
function claveTemporal(): string {
  const letras = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  return Array.from({ length: 3 }, () => Array.from({ length: 4 }, () => letras[randomInt(letras.length)]).join("")).join("-");
}

/** ¿Quedaría al menos un admin activo si se quita a este usuario? */
async function quedaOtroAdmin(admin: ReturnType<typeof clienteServicio>, sinEste: string): Promise<boolean> {
  const { count } = await admin.from("usuarios").select("id", { count: "exact", head: true }).eq("rol", "admin").eq("activo", true).neq("id", sinEste);
  return (count ?? 0) > 0;
}

const responder = (res: import("express").Response, error: unknown) => {
  const known = error instanceof ErrorHttp;
  const msg = (error as { message?: string })?.message ?? "";
  if (!known) console.warn("Equipo:", msg);
  const status = known ? error.status : /already|registered|exists/i.test(msg) ? 409 : 500;
  res.status(status).json({ error: known ? error.message : status === 409 ? "Ya existe un usuario con ese correo." : "No se pudo completar la operación." });
};

const Nuevo = z.object({
  nombre: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email().max(200),
  rol: z.enum(["admin", "vendedor"]),
});

equipo.post("/equipo/usuarios", async (req, res) => {
  try {
    const { admin } = await exigirAdmin(req);
    const datos = Nuevo.safeParse(req.body);
    if (!datos.success) throw new ErrorHttp(400, "Revisa el nombre y el correo.");
    const password = claveTemporal();
    const { data, error } = await admin.auth.admin.createUser({
      email: datos.data.email, password, email_confirm: true, user_metadata: { nombre: datos.data.nombre },
    });
    if (error || !data.user) throw error ?? new Error("sin usuario");
    // El disparador crea la fila en usuarios; aquí se fijan nombre y rol elegidos.
    await admin.from("usuarios").update({ nombre: datos.data.nombre, rol: datos.data.rol, activo: true }).eq("id", data.user.id);
    res.status(201).json({ id: data.user.id, password_temporal: password });
  } catch (error) { responder(res, error); }
});

const Cambios = z.object({
  nombre: z.string().trim().min(1).max(120).optional(),
  email: z.string().trim().toLowerCase().email().max(200).optional(),
  rol: z.enum(["admin", "vendedor"]).optional(),
  activo: z.boolean().optional(),
});

equipo.patch("/equipo/usuarios/:id", async (req, res) => {
  try {
    const { usuarioId, admin } = await exigirAdmin(req);
    const id = Id.parse(req.params.id);
    const cambios = Cambios.safeParse(req.body);
    if (!cambios.success) throw new ErrorHttp(400, "Revisa los datos.");
    const { nombre, email, rol, activo } = cambios.data;
    if (id === usuarioId && (rol === "vendedor" || activo === false)) throw new ErrorHttp(400, "No puedes quitarte tus propios permisos de administrador.");
    if ((rol === "vendedor" || activo === false) && !(await quedaOtroAdmin(admin, id))) throw new ErrorHttp(400, "Debe quedar al menos un administrador activo.");
    if (email) {
      const { error } = await admin.auth.admin.updateUserById(id, { email, email_confirm: true });
      if (error) throw error;
    }
    const fila = Object.fromEntries(Object.entries({ nombre, rol, activo }).filter(([, v]) => v !== undefined));
    if (Object.keys(fila).length) {
      const { error } = await admin.from("usuarios").update(fila).eq("id", id);
      if (error) throw new ErrorHttp(500, "No se pudo guardar.");
    }
    // Al desactivar, se cierran sus sesiones abiertas.
    if (activo === false) await admin.auth.admin.updateUserById(id, { ban_duration: "876000h" });
    if (activo === true) await admin.auth.admin.updateUserById(id, { ban_duration: "none" });
    res.json({ ok: true });
  } catch (error) { responder(res, error); }
});

equipo.post("/equipo/usuarios/:id/clave", async (req, res) => {
  try {
    const { admin } = await exigirAdmin(req);
    const id = Id.parse(req.params.id);
    const password = claveTemporal();
    const { error } = await admin.auth.admin.updateUserById(id, { password });
    if (error) throw error;
    res.json({ password_temporal: password });
  } catch (error) { responder(res, error); }
});

equipo.delete("/equipo/usuarios/:id", async (req, res) => {
  try {
    const { usuarioId, admin } = await exigirAdmin(req);
    const id = Id.parse(req.params.id);
    if (id === usuarioId) throw new ErrorHttp(400, "No puedes eliminar tu propio usuario.");
    if (!(await quedaOtroAdmin(admin, id))) throw new ErrorHttp(400, "Debe quedar al menos un administrador activo.");
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (error) { responder(res, error); }
});
