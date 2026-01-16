import { useRef } from "react";
import Header from "@/components/Header";
import Hero from "@/components/Hero";
import ProofreadingEditor from "@/components/ProofreadingEditor";
import Features from "@/components/Features";
import Footer from "@/components/Footer";

const Index = () => {
  const editorRef = useRef<HTMLDivElement>(null);

  const scrollToEditor = () => {
    editorRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        <Hero onGetStarted={scrollToEditor} />
        <ProofreadingEditor editorRef={editorRef} />
        <Features />
      </main>
      <Footer />
    </div>
  );
};

export default Index;
