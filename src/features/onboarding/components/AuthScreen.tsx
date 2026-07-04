import { ActionButton } from '@/features/onboarding/components/ActionButton';
import { BrandMark } from '@/features/onboarding/components/BrandMark';
import { ExperienceFrame } from '@/features/onboarding/components/ExperienceFrame';
import { TextField } from '@/features/onboarding/components/TextField';

type AuthScreenProps = {
  mode: 'signup' | 'signin';
  onBack: () => void;
  onSwitchMode: () => void;
  onContinue: () => void;
};

export function AuthScreen({ mode, onBack, onContinue, onSwitchMode }: AuthScreenProps) {
  const isSignup = mode === 'signup';

  return (
    <ExperienceFrame tone="light" className="auth-screen">
      <header className="top-bar">
        <button
          className="icon-button"
          onClick={onBack}
          type="button"
          aria-label="Volver"
        >
          <span aria-hidden="true">‹</span>
        </button>
        <BrandMark />
      </header>

      <section className="auth-copy">
        <p className="eyebrow">{isSignup ? 'Registro' : 'Acceso'}</p>
        <h1>{isSignup ? 'Empieza con calma.' : 'Bienvenido de nuevo.'}</h1>
      </section>

      <form
        className="auth-form"
        onSubmit={(event) => {
          event.preventDefault();
          onContinue();
        }}
      >
        {isSignup ? <TextField label="Nombre" placeholder="Alex" type="text" /> : null}
        <TextField label="Email" placeholder="alex@capitalia.app" type="email" />
        <TextField label="Clave" placeholder="••••••••" type="password" />

        <ActionButton type="submit">{isSignup ? 'Continuar' : 'Entrar'}</ActionButton>
      </form>

      <button className="text-link auth-switch" onClick={onSwitchMode} type="button">
        {isSignup ? 'Ya tengo cuenta' : 'Crear cuenta'}
      </button>
    </ExperienceFrame>
  );
}
