import type { PropsWithChildren } from 'react';

type ExperienceFrameProps = PropsWithChildren<{
  tone?: 'dark' | 'light';
  className?: string;
}>;

export function ExperienceFrame({
  children,
  tone = 'dark',
  className = ''
}: ExperienceFrameProps) {
  return (
    <main
      className={`experience-frame experience-frame--${tone} ${className}`}
      aria-label="Capitalia"
    >
      <div className="experience-canvas">{children}</div>
    </main>
  );
}
