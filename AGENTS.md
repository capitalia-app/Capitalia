# Reglas de Trabajo Para Codex

Estas reglas aplican a cualquier agente que trabaje en Capitalia.

## Git

- Nunca trabajar directamente en `main`.
- Crear una rama por tarea.
- Mantener commits pequenos, claros y revisables.
- Usar mensajes de commit descriptivos, por ejemplo:
  - `feat: add onboarding flow`
  - `fix: refine dashboard navigation`
  - `docs: document infrastructure workflow`
- No mezclar refactors no relacionados con la tarea actual.

## Calidad

Antes de cerrar una tarea, ejecutar:

```bash
npm run format:check
npm run lint
npm run typecheck
npm run build
```

Si se cambia formato, ejecutar primero:

```bash
npm run format
```

## Entorno

- No subir `.env.local`.
- No subir `.env`.
- Usar `.env.example` solo para documentar nombres de variables.
- Las variables publicas actuales de Supabase son:

```bash
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

## Supabase

- No conectar Supabase en runtime hasta que la tarea lo pida explicitamente.
- No usar `service_role` en frontend.
- No exponer secretos en variables `VITE_*`.
- Toda tabla nueva, indice, constraint, trigger o policy debe ir en
  `supabase/migrations`.
- No hacer cambios manuales en Supabase sin una migracion equivalente.
- Mantener Row Level Security como requisito por defecto en tablas de negocio.

## Producto

- Capitalia no es una app para apuntar gastos.
- El producto debe priorizar patrimonio, automatizacion y claridad financiera.
- Mantener enfoque mobile-first.
- Preservar una experiencia visual premium, sobria y escalable.
