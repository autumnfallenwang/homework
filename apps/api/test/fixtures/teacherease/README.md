# TeacherEase HTML fixtures

Real TeacherEase portal HTML, used to test the parsers against actual markup.
**Gitignored** (`*.html`) — never committed. Harvest locally from the running
desktop app or a browser session.

Drop these files here (exact names — the parser tests load them by name):

- `grades-overview-sample.html`
  The **GradeViewAllWithProgress** page
  (`/App/Parents/StandardGrade/GradeViewAllWithProgress`). The parser extracts an
  embedded JSON blob matching `"data":{"Data":[ … ],"Total"` from a `<script>` tag,
  so make sure the saved HTML includes the inline script (save the full page).

- `class-details-sample.html`
  One class's **StudentProgressStandardsDetails** page
  (`/common/StudentProgressStandardsDetails.aspx?ClassID=…&CGPID=…`) — the
  standards tree + assignment tables. Any one class is enough.

These can be unscrubbed in this local environment; the gitignore keeps them off
GitHub. Tests that depend on them skip gracefully when absent.
