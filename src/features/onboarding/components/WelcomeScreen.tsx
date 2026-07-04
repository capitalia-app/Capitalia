import { ActionButton } from '@/features/onboarding/components/ActionButton';
import { BrandMark } from '@/features/onboarding/components/BrandMark';
import { ExperienceFrame } from '@/features/onboarding/components/ExperienceFrame';

type WelcomeScreenProps = {
  environmentMessage?: string | null;
  onCreateAccount: () => void;
  onSignIn: () => void;
  onPreview: () => void;
};

export function WelcomeScreen({
  environmentMessage,
  onCreateAccount,
  onPreview,
  onSignIn
}: WelcomeScreenProps) {
  return (
    <ExperienceFrame className="welcome-screen">
      <header className="top-bar">
        <BrandMark />
        <button className="text-link" onClick={onSignIn} type="button">
          Entrar
        </button>
      </header>

      <section className="hero-stack">
        <p className="eyebrow">Capitalia</p>
        <h1>No controlas gastos. Construyes patrimonio.</h1>
        <p className="quiet-copy">
          Tu centro financiero personal, listo para crecer contigo.
        </p>
      </section>

      <section className="wealth-card" aria-label="Vista previa de patrimonio">
        <div>
          <span>Patrimonio neto</span>
          <strong>124.580 EUR</strong>
        </div>
        <div className="wealth-chart" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>
      </section>

      <footer className="action-stack">
        {environmentMessage ? (
          <p className="auth-message auth-message--error">{environmentMessage}</p>
        ) : null}
        <ActionButton onClick={onCreateAccount}>Crear cuenta</ActionButton>
        <ActionButton onClick={onPreview} variant="secondary">
          Ver experiencia
        </ActionButton>
      </footer>
    </ExperienceFrame>
  );
}
