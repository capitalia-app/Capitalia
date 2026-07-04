import { BrandMark } from '@/features/onboarding/components/BrandMark';
import { ExperienceFrame } from '@/features/onboarding/components/ExperienceFrame';

export function ConfigurationErrorScreen() {
  return (
    <ExperienceFrame tone="light" className="auth-screen">
      <header className="top-bar">
        <BrandMark />
      </header>

      <section className="auth-copy">
        <p className="eyebrow">Configuracion</p>
        <h1>Capitalia no esta conectada.</h1>
        <p className="quiet-copy">
          Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY. Configuralas en Vercel y
          vuelve a desplegar.
        </p>
      </section>
    </ExperienceFrame>
  );
}
