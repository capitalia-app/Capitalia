type BrandMarkProps = {
  size?: 'small' | 'large';
};

export function BrandMark({ size = 'small' }: BrandMarkProps) {
  return (
    <div className={`brand-mark brand-mark--${size}`} aria-label="Capitalia">
      <span>C</span>
    </div>
  );
}
