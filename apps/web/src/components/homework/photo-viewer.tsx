"use client";

import { X } from "lucide-react";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Lightbox, { type Slide } from "yet-another-react-lightbox";
import Captions from "yet-another-react-lightbox/plugins/captions";
import Counter from "yet-another-react-lightbox/plugins/counter";
import Thumbnails from "yet-another-react-lightbox/plugins/thumbnails";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import "yet-another-react-lightbox/styles.css";
import "yet-another-react-lightbox/plugins/captions.css";
import "yet-another-react-lightbox/plugins/counter.css";
import "yet-another-react-lightbox/plugins/thumbnails.css";

/** One photo the viewer can show: a saved photo's URL, or a picked one's preview. */
export interface ViewerPhoto {
  key: string;
  src: string;
  /** Shown after the caption, e.g. "not saved yet". */
  note?: string;
}

export type PhotoSection = "sheet" | "solution";

const SECTION_ORDER: PhotoSection[] = ["sheet", "solution"];
const SECTION_LABEL: Record<PhotoSection, string> = { sheet: "Homework", solution: "Solution" };

interface PhotoViewer {
  /** A grid tells the viewer which photos it shows (kept current while it is on screen). */
  setSection: (section: PhotoSection, photos: ViewerPhoto[]) => void;
  /** Open at one photo; the arrows run through every photo on the item, sheet first. */
  open: (section: PhotoSection, key: string) => void;
  /** Open a photo on its own (e.g. a removed one from the history). */
  openOne: (photo: ViewerPhoto, caption: string) => void;
}

const PhotoViewerContext = createContext<PhotoViewer | null>(null);

function samePhotos(a: ViewerPhoto[], b: ViewerPhoto[]): boolean {
  return (
    a.length === b.length &&
    a.every((p, i) => p.key === b[i]?.key && p.src === b[i]?.src && p.note === b[i]?.note)
  );
}

/**
 * The item page's photo viewer (a lightbox): thumbnails open it, arrows, keys and
 * swipes move through the item's photos, pinch or scroll zooms. The same on the
 * child's page and the parent's.
 */
export function PhotoViewerProvider({ children }: { children: ReactNode }) {
  const sections = useRef<Record<PhotoSection, ViewerPhoto[]>>({ sheet: [], solution: [] });
  const [view, setView] = useState<{ slides: Slide[]; index: number } | null>(null);

  const viewer = useMemo<PhotoViewer>(
    () => ({
      setSection: (section, photos) => {
        if (!samePhotos(sections.current[section], photos)) {
          sections.current = { ...sections.current, [section]: photos };
        }
      },
      open: (section, key) => {
        const slides: Slide[] = [];
        let index = 0;
        for (const s of SECTION_ORDER) {
          const photos = sections.current[s];
          photos.forEach((p, i) => {
            if (s === section && p.key === key) index = slides.length;
            const caption = `${SECTION_LABEL[s]} · photo ${i + 1} of ${photos.length}`;
            slides.push({ src: p.src, description: p.note ? `${caption} (${p.note})` : caption });
          });
        }
        if (slides.length > 0) setView({ slides, index });
      },
      openOne: (photo, caption) => {
        setView({ slides: [{ src: photo.src, description: caption }], index: 0 });
      },
    }),
    [],
  );

  const single = (view?.slides.length ?? 0) <= 1;

  return (
    <PhotoViewerContext.Provider value={viewer}>
      {children}
      <Lightbox
        open={view !== null}
        close={() => setView(null)}
        index={view?.index ?? 0}
        slides={view?.slides ?? []}
        plugins={single ? [Captions, Zoom] : [Captions, Counter, Thumbnails, Zoom]}
        carousel={{ finite: true }}
        controller={{ closeOnBackdropClick: true }}
        captions={{ descriptionTextAlign: "center" }}
        thumbnails={{ border: 0, borderRadius: 6, gap: 8, imageFit: "cover" }}
        zoom={{ scrollToZoom: true }}
        render={single ? { buttonPrev: () => null, buttonNext: () => null } : undefined}
      />
    </PhotoViewerContext.Provider>
  );
}

export function usePhotoViewer(): PhotoViewer {
  const viewer = useContext(PhotoViewerContext);
  if (!viewer) throw new Error("usePhotoViewer needs a PhotoViewerProvider around the page");
  return viewer;
}

/**
 * A section's photos as small tiles; a click opens the viewer there. With
 * `onRemove` each tile gets a ✕ (the child's page); `after` adds tiles at the end
 * (photos being prepared, the Add tile).
 */
export function PhotoGrid({
  section,
  photos,
  label,
  onRemove,
  disabled,
  after,
}: {
  section: PhotoSection;
  photos: ViewerPhoto[];
  label: string;
  onRemove?: (key: string) => void;
  disabled?: boolean;
  after?: ReactNode;
}) {
  const viewer = usePhotoViewer();
  useEffect(() => {
    viewer.setSection(section, photos);
  });
  useEffect(() => () => viewer.setSection(section, []), [viewer, section]);

  return (
    <div className="grid grid-cols-3 gap-2">
      {photos.map((p, i) => (
        <div key={p.key} className="relative aspect-[4/3] overflow-hidden rounded-md bg-muted">
          <button
            type="button"
            onClick={() => viewer.open(section, p.key)}
            aria-label={`Open ${label.toLowerCase()} ${i + 1} of ${photos.length}`}
            className="block h-full w-full cursor-zoom-in outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
          >
            {/* biome-ignore lint/performance/noImgElement: photos come from the API with the session cookie */}
            <img src={p.src} alt="" className="h-full w-full object-cover" />
          </button>
          {onRemove ? (
            <button
              type="button"
              onClick={() => onRemove(p.key)}
              disabled={disabled}
              aria-label={`Remove ${label.toLowerCase()} ${i + 1}`}
              className="absolute top-1 right-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/75"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      ))}
      {after}
    </div>
  );
}
