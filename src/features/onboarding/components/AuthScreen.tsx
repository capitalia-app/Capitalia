import { ActionButton } from '@/features/onboarding/components/ActionButton';
import { BrandMark } from '@/features/onboarding/components/BrandMark';
import { ExperienceFrame } from '@/features/onboarding/components/ExperienceFrame';
import { TextField } from '@/features/onboarding/components/TextField';

export type AuthFormValues = {
  fullName: string;
  email: string;
  password: string;
};

type AuthScreenProps = {
  mode: 'signup' | 'signin';
  error: string | null;
  isLoading: boolean;
  successMessage: string | null;
  onBack: () => void;
  onSwitchMode: () => void;
  onSubmit: (values: AuthFormValues) => void;
};

export function AuthScreen({
  error,
  isLoading,
  mode,
  onBack,
  onSubmit,
  onSwitchMode,
  successMessage
}: AuthScreenProps) {
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
          <span aria-hidden="true">{'<'}</span>
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

          const form = new FormData(event.currentTarget);
          const values = {
            fullName: getFormString(form, 'fullName'),
            email: getFormString(form, 'email'),
            password: getFormString(form, 'password')
          };

          onSubmit(values);
        }}
      >
        {isSignup ? (
          <TextField
            autoComplete="name"
            label="Nombre"
            name="fullName"
            placeholder="Alex"
            required
            type="text"
          />
        ) : null}
        <TextField
          autoComplete="email"
          label="Email"
          name="email"
          placeholder="alex@capitalia.app"
          required
          type="email"
        />
        <TextField
          autoComplete={isSignup ? 'new-password' : 'current-password'}
          label="Clave"
          minLength={6}
          name="password"
          placeholder="********"
          required
          type="password"
        />

        {error ? <p className="auth-message auth-message--error">{error}</p> : null}
        {successMessage ? (
          <p className="auth-message auth-message--success">{successMessage}</p>
        ) : null}

        <ActionButton disabled={isLoading} type="submit">
          {isLoading ? 'Conectando...' : isSignup ? 'Crear cuenta' : 'Entrar'}
        </ActionButton>
      </form>

      <button
        className="text-link auth-switch"
        disabled={isLoading}
        onClick={onSwitchMode}
        type="button"
      >
        {isSignup ? 'Ya tengo cuenta' : 'Crear cuenta'}
      </button>
    </ExperienceFrame>
  );
}

function getFormString(form: FormData, key: string) {
  const value = form.get(key);

  return typeof value === 'string' ? value : '';
}
