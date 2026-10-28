import { useEffect } from "react";

/**
 * Sets document.title (and optionally the meta description) for a page.
 * Replaces TanStack Start's route-level `head()` config, which doesn't
 * exist in a plain client-rendered React app.
 */
export function useDocumentTitle(title: string, description?: string) {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = title;

    let meta: HTMLMetaElement | null = null;
    let previousContent: string | null = null;
    if (description) {
      meta = document.querySelector('meta[name="description"]');
      if (meta) {
        previousContent = meta.getAttribute("content");
        meta.setAttribute("content", description);
      }
    }

    return () => {
      document.title = previousTitle;
      if (meta && previousContent !== null) meta.setAttribute("content", previousContent);
    };
  }, [title, description]);
}
