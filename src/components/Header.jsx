export default function Header() {
  return (
    <header className="header">
      <div className="header-inner">
        <a href="/" className="logo">
          <div className="logo-icon">⚡</div>
          <span>ConvertFlow</span>
        </a>
        <nav>
          <ul className="nav-links">
            <li><a href="#converters">Conversions</a></li>
            <li><a href="#features">Features</a></li>
          </ul>
        </nav>
      </div>
    </header>
  );
}
