import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

const Header = () => {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container max-w-7xl flex flex-col gap-3 py-3 md:h-16 md:flex-row md:items-center md:justify-between">
        <Link to="/" className="flex items-center">
          <div className="flex items-center justify-center w-36 h-14 rounded-xl bg-accent/10">
            <img
              src="/Icon/correctnow logo final2.png"
              alt="CorrectNow"
              className="w-32 h-12 object-contain"
              loading="eager"
            />
          </div>
        </Link>

        <nav className="hidden md:flex items-center gap-6">
          <Link
            to="/dashboard"
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Dashboard
          </Link>
          <Link
            to="/features"
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Features
          </Link>
          <Link
            to="/pricing"
            className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Pricing
          </Link>
        </nav>

        <div className="flex flex-wrap items-center gap-2">
          <Link to="/auth">
            <Button variant="ghost" size="sm" className="h-9 px-3">
              Log in
            </Button>
          </Link>
          <Link to="/auth">
            <Button variant="accent" size="sm" className="h-9 px-3">
              Get Started
            </Button>
          </Link>
        </div>
      </div>
    </header>
  );
};

export default Header;
