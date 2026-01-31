import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { getBlogPostBySlug } from "@/lib/blog";

const BlogPost = () => {
  const { slug } = useParams();

  const post = useMemo(() => {
    if (!slug) return null;
    return getBlogPostBySlug(slug);
  }, [slug]);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <main className="flex-1">
        <section className="border-b border-border bg-gradient-to-b from-background to-accent/5 py-10 md:py-14">
          <div className="container max-w-5xl">
            <div className="flex flex-col gap-3">
              <Link to="/blog" className="text-sm text-muted-foreground hover:underline">
                ← Back to Blog
              </Link>

              {!post ? (
                <>
                  <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground">
                    Post not found
                  </h1>
                  <p className="text-muted-foreground">The post may have been removed or renamed.</p>
                </>
              ) : (
                <>
                  <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">
                    {post.meta.title}
                  </h1>
                  <div className="text-sm text-muted-foreground">
                    {post.meta.date ? <span>{post.meta.date}</span> : null}
                    {post.meta.author ? <span>{post.meta.date ? " · " : ""}{post.meta.author}</span> : null}
                  </div>
                </>
              )}
            </div>
          </div>
        </section>

        {post ? (
          <section className="py-10">
            <div className="container max-w-5xl">
              <article className="prose prose-neutral dark:prose-invert max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{post.content}</ReactMarkdown>
              </article>
            </div>
          </section>
        ) : null}
      </main>

      <Footer />
    </div>
  );
};

export default BlogPost;
