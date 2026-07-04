type ProgressDotsProps = {
  activeIndex: number;
  count: number;
};

export function ProgressDots({ activeIndex, count }: ProgressDotsProps) {
  return (
    <div className="progress-dots" aria-label={`Paso ${activeIndex + 1} de ${count}`}>
      {Array.from({ length: count }).map((_, index) => (
        <span
          className={
            index === activeIndex ? 'progress-dot progress-dot--active' : 'progress-dot'
          }
          key={index}
        />
      ))}
    </div>
  );
}
