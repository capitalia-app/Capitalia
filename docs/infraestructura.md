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

`main` es la unica rama de integracion de Capitalia. Cualquier rama historica como
`chore/project-foundation` no debe usarse como base de trabajo ni como destino de pull
requests.

El flujo esperado es:

1. Crear una rama por tarea desde `main`.
2. Hacer commits pequenos y claros.
3. Abrir pull request en GitHub con base `main`.
4. Ejecutar CI: formato, lint, typecheck y build.
5. Vercel genera preview deployment para la rama.
6. Revisar visualmente el preview.
7. Merge a `main`.
8. Vercel despliega produccion desde `main`.

La rama `main` debe representar siempre una version desplegable.

Flujo resumido:

```text
Codex -> rama feature/fix desde main -> PR contra main -> checks -> merge a main -> Vercel Production -> Supabase Actions
```

Reglas de ramas:

- `feat/*` -> PR contra `main`.
- `fix/*` -> PR contra `main`.
- `docs/*` -> PR contra `main`.
- `refactor/*` -> PR contra `main`.
- No trabajar directamente en `main`.
- No abrir nuevas PR contra `chore/project-foundation`.

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

El proyecto incluye Supabase CLI, `supabase/config.toml` y el workflow
`.github/workflows/supabase.yml`.

El flujo objetivo es:

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
- Instalar dependencias con `npm ci`, incluyendo el paquete oficial `supabase`.
- Aplicar las migraciones en una base local con `npx supabase db start`.
- Ejecutar `npx supabase db lint`.
- En `main`, enlazar el proyecto remoto con `SUPABASE_PROJECT_REF`.
- Preparar `npx supabase db push --yes` usando `SUPABASE_ACCESS_TOKEN`.

La aplicacion de migraciones a produccion debe requerir aprobacion manual hasta que haya
suficiente confianza operacional.

## Secrets de GitHub Para Supabase

Configurar estos secrets en:

```text
GitHub -> Repository -> Settings -> Secrets and variables -> Actions
```

Secrets requeridos:

```text
SUPABASE_ACCESS_TOKEN
SUPABASE_PROJECT_REF
```

`SUPABASE_ACCESS_TOKEN` es un personal access token de Supabase para que el CLI pueda
operar en CI sin ejecutar `supabase login`.

`SUPABASE_PROJECT_REF` es el identificador del proyecto hospedado. Aparece en la URL del
dashboard:

```text
https://supabase.com/dashboard/project/<project-ref>
```

No anadir valores reales al repositorio.

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
