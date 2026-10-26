// The title at the top left of every page, which is also the view switcher:
// the page's name with a caret beside it, over a small line (the crumb).
// Clicking the name or the caret, or Enter or Space on it, opens the list of
// views: the main views first (Orbits, Orbits 3D, the Spider web and the City), then
// Circles, the Table and the Calendar, then the frozen views, then the open view's settings, if it has any, in a section set apart
// (ViewSettings.tsx, viewSettings.ts; on a page that shows names, Name format, which
// names it shows, comes first in it), then, under About the app, the Demo
// (src/views.ts); Esc, a click elsewhere or moving focus
// out closes it. Links are real links, so a view can open in a new tab;
// `navigate` lets the map views switch between themselves in place, and a page
// (the Demo) always loads as its own. In the demo (demoMode.ts) the
// demo's views are listed (DEMO_VIEWS in views.ts) at their places in it (under
// /demo in the app, at the root of the static demo's site), with none of them
// called frozen, the main views first as ever, and nothing else: no Demo, and no way into the
// real map.

import { useEffect, useId, useRef, useState } from "react";
import { demoMode, demoRoot } from "./demoMode.ts";
import { ViewSettings } from "./ViewSettings.tsx";
import { address } from "./mount.ts";
import { DEMO_PAGE, MAIN_VIEWS, VIEWS, viewPath, viewsFor, type ViewInfo } from "./views.ts";
import "./viewSwitcher.css";

export type Navigate = (to: string) => (event: React.MouseEvent) => void;

export function ViewSwitcher({ current, crumb, navigate, names = false, look = false, demo = demoMode }: {
  /** The slug of the view shown, in VIEWS. */
  current: string;
  /** The small line over the title. */
  crumb: string;
  navigate?: Navigate;
  /** Whether the settings offer Name format, the choice of which names the page shows. */
  names?: boolean;
  /** Whether the settings offer Look, the page's theme (theme.ts): on the map page's views, not the Table's or the Calendar's page. */
  look?: boolean;
  /** Whether this is the demo's switcher, listing the demo's views alone. */
  demo?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const title = VIEWS.find((view) => view.slug === current)?.title ?? "Views";

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => !ref.current?.contains(event.target as Node) && setOpen(false);
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      // Back to the title if Esc came from inside the list, so the keyboard is not left nowhere.
      if (ref.current?.contains(document.activeElement)) button.current?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div
      className="view-switcher"
      ref={ref}
      // Tabbing out of the list closes it. Focus going nowhere (a click in Safari, which
      // does not focus what it clicks) is left to the pointer handler, or a click on a link would be lost.
      onBlur={(event) => {
        const to = event.relatedTarget as Node | null;
        if (open && to && !ref.current?.contains(to)) setOpen(false);
      }}
    >
      <span className="view-switcher__crumb">{crumb}</span>
      <h1>
        <button
          ref={button}
          type="button"
          className="view-switcher__button"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          title="Switch view"
          onClick={() => setOpen((o) => !o)}
        >
          {title}
          <svg width="12" height="12" viewBox="0 0 10 10" aria-hidden><path d="M2 3.5 L5 6.5 L8 3.5" fill="none" stroke="currentColor" strokeWidth="1.4" /></svg>
        </button>
      </h1>
      {open && <ViewList id={menuId} current={current} navigate={navigate} names={names} look={look} demo={demo} onPick={() => setOpen(false)} />}
    </div>
  );
}

/**
 * The list the switcher opens: the main views, Circles, the Table and the Calendar, the frozen views, the current
 * view's settings if it has any (with `names`, Name format first among them), then the Demo; in the demo
 * (`demo`), its own views alone, none of them frozen, at their places under `root`, and the current one's settings.
 */
export function ViewList({ id, current, navigate, onPick, names = false, look = false, demo = demoMode, root = demoRoot }: {
  id?: string;
  current: string;
  navigate?: Navigate;
  onPick: () => void;
  names?: boolean;
  look?: boolean;
  demo?: boolean;
  /** Where the demo's views are (demoRoot). */
  root?: string;
}) {
  const views = viewsFor(demo);
  const main = views.filter((view) => MAIN_VIEWS.includes(view.slug));
  const others = views.filter((view) => !MAIN_VIEWS.includes(view.slug));
  const shown = VIEWS.find((view) => view.slug === current);
  const link = (view: Pick<ViewInfo, "slug" | "path" | "title">, go?: Navigate, title?: string) => {
    const path = viewPath(view, demo, root);
    return (
      <a
        key={view.slug}
        href={address(path)}
        title={title}
        aria-current={view.slug === current ? "page" : undefined}
        onClick={(event) => {
          onPick();
          go?.(path)(event);
        }}
      >
        {view.title}
      </a>
    );
  };
  return (
    <nav className="view-switcher__menu" id={id} aria-label="Views">
      <span className="view-switcher__group">Main views</span>
      {main.map((view) => link(view, navigate))}
      <span className="view-switcher__group">Other views</span>
      {others.filter((view) => demo || !view.frozen).map((view) => link(view, navigate))}
      {!demo && (
        <>
          <span className="view-switcher__group" title="Kept working as they are, with no new features">Frozen</span>
          {others.filter((view) => view.frozen).map((view) => link(view, navigate))}
        </>
      )}
      {shown && <ViewSettings slug={shown.slug} title={shown.title} names={names} look={look} demo={demo} />}
      {!demo && (
        <>
          <span className="view-switcher__group">About the app</span>
          {link(DEMO_PAGE, undefined, "The map views on a made-up crowd, for showing friend-map to someone, as the public demo shows them: nothing of yours is in it")}
        </>
      )}
    </nav>
  );
}
