import { useMemo, useEffect } from "react";
import { useParams, Navigate } from "react-router-dom";
import { LandingHeader } from "@/components/landing/LandingHeader";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { useLandingContent } from "@/contexts/LandingContentContext";

function setMeta(name: string, content: string, property = false) {
  const attr = property ? "property" : "name";
  let el = document.querySelector(`meta[${attr}="${name}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.content = content;
}

function setCanonical(href: string) {
  let el = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement("link");
    el.rel = "canonical";
    document.head.appendChild(el);
  }
  el.href = href;
}

const sanitizeHtml = (input: string) => {
  if (!input) return "";

  let html = input;

  html = html.replace(/<\s*script[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, "");
  html = html.replace(/<\s*style[^>]*>[\s\S]*?<\s*\/\s*style\s*>/gi, "");
  html = html.replace(/\son\w+\s*=\s*"[^"]*"/gi, "");
  html = html.replace(/\son\w+\s*=\s*'[^']*'/gi, "");
  html = html.replace(/\son\w+\s*=\s*[^\s>]+/gi, "");
  html = html.replace(/javascript:/gi, "");

  return html;
};

const PublicContentPageInner = ({ pageKey }: { pageKey: string }) => {
  const { content } = useLandingContent();

  const page = useMemo(() => content.pages[pageKey], [content.pages, pageKey]);

  useEffect(() => {
    if (!page) return;

    const pageTitle = page.metaTitle || page.title;
    const siteTitle = content.siteTitle || "Flyn";
    document.title = pageTitle ? `${pageTitle} | ${siteTitle}` : siteTitle;

    if (page.metaDescription) setMeta("description", page.metaDescription);
    if (page.ogTitle) setMeta("og:title", page.ogTitle, true);
    else if (pageTitle) setMeta("og:title", `${pageTitle} | ${siteTitle}`, true);
    if (page.ogDescription) setMeta("og:description", page.ogDescription, true);
    if (page.canonicalUrl) setCanonical(page.canonicalUrl);

    return () => {
      // Restore site-level title when leaving
      document.title = content.siteTitle || siteTitle;
    };
  }, [page, content.siteTitle]);

  if (!page) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="min-h-screen bg-background">
      <LandingHeader />

      <main className="pt-20">
        <section className="relative py-12 lg:py-16 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-background to-accent/5" />
          <div className="relative max-w-4xl mx-auto px-4 sm:px-6">
            <h1 className="font-display text-3xl sm:text-4xl font-bold text-foreground">
              {page.title}
            </h1>
            <div className="mt-6 rounded-2xl border border-border bg-card p-6 lg:p-8">
              <div
                className="text-sm sm:text-base text-muted-foreground leading-relaxed"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(page.body) }}
              />
            </div>
          </div>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
};

export const PublicContentPage = ({ pageKey }: { pageKey: string }) => {
  return <PublicContentPageInner pageKey={pageKey} />;
};

export const RoutedPublicContentPage = ({ baseKey }: { baseKey: string }) => {
  return <RoutedPublicContentPageInner baseKey={baseKey} />;
};

const RoutedPublicContentPageInner = ({ baseKey }: { baseKey: string }) => {
  const params = useParams();
  const slug = params.slug;

  if (!slug) {
    return <Navigate to="/" replace />;
  }

  return <PublicContentPageInner pageKey={`${baseKey}/${slug}`} />;
};

const PublicContentPageWithProvider = ({ pageKey }: { pageKey: string }) => {
  return <PublicContentPage pageKey={pageKey} />;
};

export default PublicContentPageWithProvider;
