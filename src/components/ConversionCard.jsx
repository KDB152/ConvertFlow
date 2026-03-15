export default function ConversionCard({ conversion, isActive, onClick }) {
  return (
    <div
      className={`conversion-card ${isActive ? 'active' : ''}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
      id={`card-${conversion.id}`}
    >
      <div className="card-content">
        <div className={`card-icon ${conversion.iconClass}`}>
          {conversion.icon}
        </div>
        <h3>{conversion.title}</h3>
        <p>{conversion.description}</p>
        <div className="card-formats">
          {conversion.fromFormats.map((f) => (
            <span key={f} className="format-badge from">{f}</span>
          ))}
          <span className="card-arrow">→</span>
          {conversion.toFormats.map((f) => (
            <span key={f} className="format-badge to">{f}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
