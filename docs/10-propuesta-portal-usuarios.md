# Propuesta: portal enrutador de usuarios para FIFO1 y FIFO2

> **Estado:** propuesta guardada para validación. **No implementada.**
> No se modificó código, hojas, despliegues ni credenciales.
>
> Fecha: 2026-10-21
> Objetivo: evaluar un portal central que autentique usuarios, los asigne a FIFO1 o FIFO2
> y permita crear, autorizar, desactivar y eliminar accesos.

---

## 1. Solicitud entendida

1. Crear una aplicación central que sirva de **enrutador** entre FIFO1 y FIFO2.
2. Esa aplicación administra usuarios: los crea, los autoriza y también puede eliminarlos.
3. Cada usuario queda **amarrado a un solo proyecto FIFO** y, al entrar, solo puede trabajar
   con esa instancia.

---

## 2. Veredicto de viabilidad

**Sí es posible**, pero con una condición crítica:

> El enrutador **no aporta seguridad por sí solo**. Si únicamente redirige a la URL de FIFO1 o
> FIFO2, el usuario puede copiar la URL directa y entrar a la otra instancia. La seguridad real
> aparece cuando **FIFO1 y FIFO2 validan un token de acceso** y rechazan a quien no tenga la
> instancia correcta.

Situación actual que debe corregirse:

- Las dos aplicaciones son públicas.
- Las dos usan la misma clave de acceso.
- Cualquiera que conozca las dos URLs y la clave puede entrar a cualquiera de las dos.
- `Session.getActiveUser()` no es confiable en la PWA porque las llamadas van por JSONP y el
  correo llega vacío.
- La arquitectura actual no tiene usuarios, roles ni auditoría por persona.

---

## 3. Ejemplo práctico

| Correo | Instancia | Rol | Estado |
|---|---|---|---|
| `ana@empresa.com` | AMBAS | administradora | ACTIVO |
| `juan@gmail.com` | FIFO1 | operador | ACTIVO |
| `maria@gmail.com` | FIFO2 | operador | ACTIVO |

### Flujo de Juan

1. Juan abre el portal: `https://portal-fifo...`
2. Pulsa **Continuar con Google**.
3. El portal verifica su identidad con Google y busca `juan@gmail.com` en la hoja central
   `USUARIOS`.
4. Como está activo y amarrado a **FIFO1**, el portal le entrega un token temporal y lo redirige a:
   `https://alejandrocarvajalvargas-glitch.github.io/FIFO/#t=token...`
5. La PWA de FIFO1 guarda el token y lo envía en cada llamada a la API.
6. FIFO1 valida:
   - firma correcta;
   - token vigente;
   - `instancia = FIFO1`;
   - usuario activo.
7. Juan trabaja normalmente en FIFO1.

### Si Juan intenta entrar a FIFO2

- Abre la URL de FIFO2 o intenta llamar su API.
- FIFO2 recibe el token, ve que `instancia = FIFO1` y responde:
  `No autorizado para esta instancia`.
- No puede usar FIFO2 aunque conozca la URL.

### Si Ana desactiva a Juan

- Ana entra al panel de administración.
- Cambia el estado de Juan a **INACTIVO**.
- El token de Juan vence en pocos minutos y FIFO1 deja de aceptarlo.
- Si se necesita bloqueo inmediato, FIFO1 consulta una lista de revocación central antes de aceptar.

### Si Ana elimina a Juan

- Se borra o desactiva su registro.
- Se registra la acción en `AUDITORIA`.
- Juan ya no puede iniciar sesión.
- No se borra su cuenta de Google; solo se le quita el acceso a FIFO.

---

## 4. Arquitectura propuesta

```text
                 Google Identity
                       |
                       v
              +-------------------+
              |  Portal / Router  |
              |  login + usuarios |
              +---------+---------+
                        |
          consulta hoja central USUARIOS
                        |
        +---------------+---------------+
        |                               |
        v                               v
   FIFO1 PWA                       FIFO2 PWA
        |                               |
   token FIFO1                     token FIFO2
        |                               |
        v                               v
   FIFO1 Code.gs                   FIFO2 Code.gs
   valida firma + instancia        valida firma + instancia
```

### Hoja central propuesta

```text
USUARIOS
email | nombre | instancia | rol | estado | creado_por | creado_en | ultimo_acceso

AUDITORIA
fecha | actor | accion | email_afectado | instancia | resultado
```

`instancia` admitiría `FIFO1`, `FIFO2` o `AMBAS` solo para administradores.
`estado` admitiría `ACTIVO`, `INACTIVO` o `ELIMINADO`.

“Crear usuario” significaría **crear el acceso de una persona que ya tiene cuenta Google**, no
crear una cuenta Gmail desde cero. Crear cuentas Google automáticamente no es una opción gratuita
ni recomendable.

---

## 5. Opciones gratuitas y seguras

| Opción | Costo | Ventaja | Consideración |
|---|---|---|---|
| **Google Sign-In + Apps Script + Google Sheets + tokens HMAC** | $0 | Usa el stack actual, sin contraseñas, sin nuevo proveedor | Apps Script tiene límites de UI/iframe; hay que adaptar los dos backends |
| **Cloudflare Access + Worker + Google** | $0 hasta 50 usuarios | SSO administrado, mejor control de acceso, rate limiting, auditoría | Nuevo proveedor; puede requerir dominio propio y más configuración |
| **Firebase Auth + Firestore** | $0 en uso pequeño | Login con Google o correo/contraseña, administración de usuarios | Más configuración; Cloud Functions puede requerir plan Blaze |
| **Google Workspace** | No gratis | Integración nativa con grupos y permisos | Solo si ya tienen Workspace |

Recomendación inicial:

**Google Sign-In + un portal pequeño + hoja central `USUARIOS` + token firmado + validación en
FIFO1 y FIFO2.**

Si más adelante se quiere un SSO más administrado y reglas de acceso más fuertes, se puede migrar
a Cloudflare Access sin rehacer la lógica de negocio.

---

## 6. Cambios necesarios si se implementa

No es solo crear una app nueva. Habría que tocar:

1. **Nuevo portal**
   - Login con Google.
   - Panel de administración.
   - Crear, autorizar, desactivar y eliminar usuarios.
   - Asignar FIFO1 o FIFO2.
   - Auditoría.

2. **Hoja central**
   - `USUARIOS`
   - `AUDITORIA`
   - Opcional: `INVITACIONES`

3. **FIFO1 y FIFO2**
   - Aceptar un token además de la clave actual.
   - Validar firma, vencimiento e instancia.
   - Rechazar tokens de la otra instancia.
   - No confiar en el `operador` que manda el cliente.
   - Idealmente, eliminar la clave compartida y usar una clave de emergencia separada.

4. **PWA**
   - Recibir el token del portal.
   - Guardarlo en memoria o `sessionStorage`, no en la URL permanente.
   - Enviarlo en las llamadas.
   - Manejar expiración y cierre de sesión.

5. **Seguridad**
   - Token de vida corta, por ejemplo 5–10 minutos.
   - Firma con secreto distinto para FIFO1 y FIFO2.
   - Secretos en Script Properties o en el Worker, nunca en el repositorio.
   - Administradores con verificación en dos pasos.
   - Registro de accesos y acciones administrativas.
   - Sin registro público: solo un administrador crea usuarios.

---

## 7. Qué mejora realmente

- Deja de haber una clave única compartida.
- Cada usuario tiene identidad.
- Cada usuario queda limitado a una instancia.
- Se puede revocar el acceso.
- Queda auditoría de quién entró y qué hizo.
- El administrador controla altas y bajas.

No la mejora si el portal solo redirige y los backends siguen aceptando la clave compartida.

---

## 8. Plan sugerido por fases

1. **Validación** (esta etapa): confirmar alcance, cuentas y opción tecnológica.
2. **Prototipo aislado:** hoja `USUARIOS`, portal de prueba y un usuario de prueba; sin tocar producción.
3. **Token en FIFO1:** validar token, instancia y expiración en un entorno de prueba.
4. **Token en FIFO2:** replicar y probar rechazo cruzado.
5. **Panel de administración y auditoría.**
6. **Piloto** con un operador por instancia.
7. **Despliegue gradual** y retiro de la clave compartida.

---

## 9. Decisiones pendientes antes de implementar

1. ¿“Crear usuarios” significa **dar acceso a personas con cuenta Google**, o se necesitan crear
   cuentas Gmail nuevas?
2. ¿Un usuario puede estar en **una sola instancia** o un administrador puede tener ambas?
3. ¿Quiénes serán los administradores? Se necesitan sus correos.
4. ¿Los operadores tienen cuenta Google? Si no, habría que evaluar Firebase con correo/contraseña.
5. ¿Se acepta que una desactivación tarde unos minutos, o se necesita bloqueo inmediato?
6. ¿El portal se prefiere dentro de Apps Script, o en GitHub Pages/Cloudflare con una capa de
   autenticación?

Con esas respuestas se puede cerrar el diseño y ejecutar un piloto sin tocar producción.
