export default function Avatar({ name, color, avatarPath, size = 36, className = '' }) {
  if (avatarPath) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarPath}
        alt={name || ''}
        style={{ width: size, height: size }}
        className={`rounded-full object-cover shrink-0 ${className}`}
      />
    );
  }
  return (
    <div
      className={`rounded-full flex items-center justify-center text-white font-semibold shrink-0 ${className}`}
      style={{ width: size, height: size, backgroundColor: color || '#3F7069', fontSize: size * 0.42 }}
    >
      {name?.charAt(0) || '?'}
    </div>
  );
}
