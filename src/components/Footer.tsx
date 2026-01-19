import { Link } from "react-router-dom";

const Footer = () => {
  return (
    <footer className="mt-auto w-full border-t border-border bg-background py-12">
      <div className="container">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6 text-center md:text-left">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-20 h-10 rounded-lg bg-accent/10">
              <img
                src="/Icon/correctnow logo final2.png"
                alt="CorrectNow"
                className="w-16 h-8 object-contain"
                loading="lazy"
              />
            </div>
          </div>

          <nav className="flex flex-wrap items-center justify-center md:justify-start gap-x-6 gap-y-3 text-sm text-muted-foreground">
            <Link to="/about" className="hover:text-foreground transition-colors">
              About Us
            </Link>
            <Link to="/privacy-policy" className="hover:text-foreground transition-colors">
              Privacy
            </Link>
            <Link to="/refund-policy" className="hover:text-foreground transition-colors">
              Refund Policy
            </Link>
            <Link to="/disclaimer" className="hover:text-foreground transition-colors">
              Disclaimer
            </Link>
            <a href="#" className="hover:text-foreground transition-colors">
              Terms
            </a>
            <Link to="/contact" className="hover:text-foreground transition-colors">
              Contact
            </Link>
          </nav>

          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} CorrectNow. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
