import { CheckCircle } from "lucide-react";
import { Link } from "react-router-dom";

const Footer = () => {
  return (
    <footer className="mt-auto w-full border-t border-border bg-background py-12">
      <div className="container">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-accent">
              <CheckCircle className="w-4 h-4 text-accent-foreground" />
            </div>
            <span className="text-lg font-semibold text-foreground">
              CorrectNow
            </span>
          </div>

          <nav className="flex items-center gap-6 text-sm text-muted-foreground">
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
