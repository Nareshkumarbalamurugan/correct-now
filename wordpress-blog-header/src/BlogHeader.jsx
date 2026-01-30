import React from 'react';

const BlogHeader = () => {
  return (
    <header className="cn-header">
      <div className="cn-container">
        {/* Logo Section */}
        <div className="cn-logo-section">
          <a href="https://correctnow.app" className="cn-logo-link">
            <img
              src="https://correctnow.app/Icon/correctnow%20logo%20final2.png"
              alt="CorrectNow"
              className="cn-brand-logo"
            />
          </a>
        </div>

        {/* Desktop Navigation */}
        <nav className="cn-nav-desktop">
          <a href="https://correctnow.app/about" className="cn-nav-link">
            About Us
          </a>
          <a href="https://correctnow.app/features" className="cn-nav-link">
            Features
          </a>
          <a href="/blog" className="cn-nav-link cn-nav-active">
            Blog
          </a>
          <a href="https://correctnow.app/pricing" className="cn-nav-link">
            Pricing
          </a>
          <a href="https://correctnow.app/languages" className="cn-nav-link">
            Languages
          </a>
        </nav>

        {/* CTA Buttons */}
        <div className="cn-cta-section">
          <a href="https://correctnow.app/auth" className="cn-btn cn-btn-ghost">
            Log in
          </a>
          <a href="https://correctnow.app/auth?mode=register" className="cn-btn cn-btn-accent">
            Get Started
          </a>
        </div>
      </div>

      {/* Mobile Navigation */}
      <nav className="cn-nav-mobile">
        <a href="https://correctnow.app/about" className="cn-nav-link-mobile">
          About Us
        </a>
        <a href="https://correctnow.app/features" className="cn-nav-link-mobile">
          Features
        </a>
        <a href="/blog" className="cn-nav-link-mobile cn-nav-mobile-active">
          Blog
        </a>
        <a href="https://correctnow.app/pricing" className="cn-nav-link-mobile">
          Pricing
        </a>
        <a href="https://correctnow.app/languages" className="cn-nav-link-mobile">
          Languages
        </a>
      </nav>
    </header>
  );
};

export default BlogHeader;
