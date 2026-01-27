import Header from "@/components/Header";
import Footer from "@/components/Footer";

const Blog = () => {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <main className="flex-1">
        <section className="border-b border-border bg-gradient-to-b from-background to-accent/5 py-10 md:py-14">
          <div className="container max-w-6xl">
            <div className="flex flex-col items-center text-center gap-3">
              <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">
                Blog
              </h1>
              <p className="text-base md:text-lg text-muted-foreground max-w-2xl">
                Updates, writing tips, and product news from CorrectNow
              </p>
            </div>
          </div>
        </section>

        <section className="py-6 md:py-8">
          <div className="container max-w-6xl">
            <div className="rounded-xl border border-border overflow-hidden bg-background">
              <iframe
                title="CorrectNow Blog"
                src="/blog-wp"
                className="w-full h-[80vh] md:h-[85vh]"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default Blog;
