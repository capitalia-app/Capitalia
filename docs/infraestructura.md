# Infraestructura de Capitalia

Capitalia usa React, Vite, TypeScript, Supabase, PostgreSQL, GitHub y Vercel. Este
documento define el flujo de infraestructura inicial para mantener el proyecto ordenado
antes de automatizar despliegues y migraciones.

## Variables de Entorno

El frontend espera estas variables publicas para configurar el cliente de Supabase en el
futuro:

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

La clave `anon` de Supabase puede vivir en el frontend siempre que las tablas tengan Row
Level Security correctamente configurado. No debe confundirse con la clave
`service_role`, que nunca debe llegar al navegador.

## Flujo GitHub -> Vercel

El flujo esperado es:

1. Crear una rama por tarea desde `main`.
2. Hacer commits pequenos y claros.
3. Abrir pull request en GitHub.
4. Ejecutar CI: formato, lint, typecheck y build.
5. Vercel genera preview deployment para la rama.
6. Revisar visualmente el preview.
7. Merge a `main`.
8. Vercel despliega produccion desde `main`.

La rama `main` debe representar siempre una version desplegable.

## Variables de Entorno en Vercel

En Vercel, configurar las variables desde:

```text
Project Settings -> Environment Variables
```

Crear al menos:

```bash
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

Recomendaciones:

- Definir valores separados para Preview y Production si hay proyectos Supabase distintos.
- No pegar claves privadas en variables `VITE_*`, porque Vite las expone al bundle del
  navegador.
- Si en el futuro se necesitan secretos backend, deben vivir en funciones server-side, no
  en codigo frontend.

## Migraciones Supabase Manuales Por Ahora

Por ahora, las migraciones se aplicaran manualmente desde Supabase SQL Editor o mediante
una maquina local con Supabase CLI cuando este disponible.

Reglas:

- Toda modificacion de base de datos debe vivir en `supabase/migrations`.
- No hacer cambios manuales de esquema sin reflejarlos en una migracion.
- Aplicar migraciones en orden cronologico.
- Revisar cada SQL antes de ejecutarlo.
- Validar que Row Level Security queda activo para tablas de negocio.

Flujo manual recomendado:

1. Abrir el archivo SQL de `supabase/migrations`.
2. Copiar la migracion completa.
3. Ejecutarla en Supabase SQL Editor sobre el entorno correcto.
4. Verificar tablas, indices, constraints y politicas RLS.
5. Registrar cualquier ajuste como una nueva migracion, nunca editando historico ya
   aplicado.

## Automatizacion Futura

Cuando el proyecto tenga Supabase CLI y entornos definidos, el flujo objetivo sera:

1. Desarrollar migraciones localmente.
2. Validarlas con una base Supabase local o de staging.
3. Ejecutar migraciones en CI contra staging.
4. Desplegar frontend preview en Vercel.
5. Promocionar cambios a produccion tras aprobacion.

GitHub Actions deberia encargarse de:

- Instalar dependencias.
- Ejecutar `npm run format:check`.
- Ejecutar `npm run lint`.
- Ejecutar `npm run typecheck`.
- Ejecutar `npm run build`.
- Validar migraciones con Supabase CLI cuando este configurado.

La aplicacion de migraciones a produccion debe requerir aprobacion manual hasta que haya
suficiente confianza operacional.

## Claves Que Nunca Deben Subirse A GitHub

Nunca subir:

- `.env.local`
- `.env`
- `SUPABASE_SERVICE_ROLE_KEY`
- tokens personales de GitHub
- tokens de Vercel
- claves privadas de OpenAI
- credenciales de bases de datos
- refresh tokens de proveedores bancarios
- secretos de Gmail u Open Banking
- dumps de datos financieros reales

La unica clave Supabase pensada para frontend es:

```bash
VITE_SUPABASE_ANON_KEY
```

Incluso esa clave debe ir en variables de entorno, no hardcodeada en el codigo.
