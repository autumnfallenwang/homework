# Homework HTML fixtures

Real Google Sites homework-page HTML, used to test the homework parser.
**Gitignored** (`*.html`) — never committed. Harvest locally.

Drop this file here (exact name):

- `google-sites-sample.html`
  The Google Sites homework page (the per-child `homeworkUrl`). Google Sites is
  JS-rendered, so **save the rendered DOM**, not view-source: open the page in a
  browser, DevTools → Console → `copy(document.documentElement.outerHTML)`, paste
  here. (Or use the desktop app's sandbox capture.)

Unscrubbed is fine locally; the gitignore keeps it off GitHub. The parser test
skips gracefully when this file is absent.
